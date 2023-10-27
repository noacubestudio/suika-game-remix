// config
const DROP_HEIGHT = 150;
const DROP_BARRIER = 10;
const PLAY_AREA_HEIGHT = 600; // make sure to also update the css
const PLAY_AREA_WIDTH = 500;

const GRAVITY_MULT = 1.2;
const MS_UNTIL_LOST = 2000;

const BAG_ITEM_COUNT = 5;
const SPHERES_CONFIG = [
    { stage:  1, radius:  14, points:   2, density: 0.3 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-01.wav') },
    { stage:  2, radius:  20, points:   4, density: 0.25, friction: 0.2, restitution: 0.15, sound: new Audio('woosh-02.wav') },
    { stage:  3, radius:  30, points:   6, density: 0.2 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-03.wav') },
    { stage:  4, radius:  40, points:  10, density: 0.2 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-04.wav') },
    { stage:  5, radius:  54, points:  16, density: 0.2 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-01.wav') },
    { stage:  6, radius:  66, points:  26, density: 0.2 , friction: 0.2, restitution: 0.15 },
    { stage:  7, radius:  80, points:  42, density: 0.2 , friction: 0.2, restitution: 0.15 },
    { stage:  8, radius: 100, points:  68, density: 0.2 , friction: 0.2, restitution: 0.15 },
    { stage:  9, radius: 120, points: 110, density: 0.2 , friction: 0.2, restitution: 0.15 },
    { stage: 10, radius: 140, points: 500, density: 0.2 , friction: 0.2, restitution: 0.15 },
    { stage: 11, radius: 160, points: 999, density: 0.2 , friction: 0.2, restitution: 0.15 },
];

// load
const mergeSound = new Audio('pop1.wav');

// matter.js stuff
const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Events = Matter.Events,
    MouseConstraint = Matter.MouseConstraint,
    Mouse = Matter.Mouse,
    Common = Matter.Common,
    Composite = Matter.Composite,
    Composites = Matter.Composites,
    Bodies = Matter.Bodies,
    Body = Matter.Body;

// create engine
const engine = Engine.create();
engine.gravity.scale = 0.001 * GRAVITY_MULT;
const world = engine.world;

// random seed based on hour and date
Common._seed = (() => {
    const d = new Date();
    const fulldate = d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
    const currentHour = d.getHours();
    return fulldate * 100 + currentHour;
})();
document.getElementById('seed').textContent = "Seed " + Common._seed;

// create renderer
const canvas = document.getElementById('canvas-container');
const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
        width: PLAY_AREA_WIDTH,
        height: PLAY_AREA_HEIGHT + DROP_HEIGHT,
        background: '#4A1D60',
        wireframes: false,
        // showCollisions: true,
        // showDebug: true,
    }
});
Render.run(render);

// create runner, simple gameloop
const runner = Runner.create();
Runner.run(runner, engine);



// game state
let randomBag = [];
const nextDrops = Composite.create();
let dropScheduled = false;
let scheduledMerges = [];
let ticksToNextDrop = 10;
let inputX = null;
let stackX = PLAY_AREA_WIDTH / 2;
let score = 0;
let lostGame = false;
let lostGameTimestamp = null;
let lastTickTime = Common.now();


// construct walls, initial stack of spheres, sensor at the top
sceneSetup();



// slowly drop stack
Events.on(engine, 'beforeUpdate', (event) => {

    // do merges
    doPlannedMerges(scheduledMerges);


    // drop stack of spheres above the lowest to follow
    if (nextDrops.bodies.length > 0) {
        updateStackState();
    } else {
        dropScheduled = false;
    }

    // all bodies
    for (const body of world.bodies) {

        // grow
        if (body.growPercent < 1) {
            body.growPercent *= 2;
            Body.scale(body, 2, 2);
            body.render.sprite.xScale = 2 - body.growPercent;
            body.render.sprite.yScale = 2 - body.growPercent;
            if (body.growPercent >= 1) {
                body.growPercent = undefined;
            }
        }

        if (body.position.y <= 20) {
            Runner.stop(runner);
            drawOntop();
        }
    }

    if (lostGame && Common.now() - lostGameTimestamp > 4000) {
        Runner.stop(runner);
        drawOntop();
    }
});

Events.on(engine, 'afterUpdate', (event) => { drawOntop(); });

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        if (pair.bodyA.isSensor && !pair.bodyB.isStatic) {
            pair.bodyB.dangerStartTime = Common.now();
        } else if (pair.bodyB.isSensor && !pair.bodyA.isStatic) {
            pair.bodyA.dangerStartTime = Common.now();
        } else if (pair.bodyA.stage === pair.bodyB.stage && pair.bodyA.isStatic === pair.bodyB.isStatic) {
            spheresCollided(pair.bodyA, pair.bodyB);
        }
    });
});

Events.on(engine, 'collisionActive', (event) => {
    event.pairs.forEach((pair) => {
        if (pair.bodyA.isSensor && !pair.bodyB.isStatic) {
            if (Common.now() - pair.bodyB.dangerStartTime > MS_UNTIL_LOST) endGame();
        } else if (pair.bodyB.isSensor && !pair.bodyA.isStatic) {
            if (Common.now() - pair.bodyA.dangerStartTime > MS_UNTIL_LOST) endGame();
        }
    });
});

// mouse/touch events
document.addEventListener('touchstart', startedTouch);
document.addEventListener('touchmove', movedTouch);
document.addEventListener('touchend', endedTouch);
let usingTouchDevice = undefined;
document.addEventListener('mousedown', startedTouch);
document.addEventListener('mousemove', movedTouch);
document.addEventListener('mouseup', endedTouch);

// Event listener for the spacebar key press
document.addEventListener('keydown', (event) => {
    if ([' ', 'Spacebar', 'Enter', 's', 'S'].includes(event.key)) { // Check for spacebar key
        event.preventDefault();
        dropWithKeyboard();
    }
});

function dropWithKeyboard() {
    if (lostGame) return;
    pushSphereFromBag(nextDrops, bagNext()); 
    dropScheduled = true;
}

function startedTouch(event) {
    event.preventDefault();
    if (lostGame) return;
    if (event.type === 'touchstart') usingTouchDevice = true;
    if (event.type === 'mousedown' && usingTouchDevice) return;

    pushSphereFromBag(nextDrops, bagNext()); 

    const pos = (event.touches !== undefined) ? event.touches[0] : event;
    const rect = canvas.getBoundingClientRect();
    const scaledX = (pos.clientX - rect.left) / rect.width;
    inputX = scaledX * PLAY_AREA_WIDTH;
    moveStackX(inputX);
}

function movedTouch(event) {
    event.preventDefault();
    if (event.type === 'mousemove' && usingTouchDevice) return;
    if (lostGame) return;

    const pos = (event.touches !== undefined) ? event.touches[0] : event;
    const rect = canvas.getBoundingClientRect();
    const scaledX = (pos.clientX - rect.left) / rect.width;
    inputX = scaledX * PLAY_AREA_WIDTH;
    moveStackX(inputX);
}

function endedTouch(event) {
    if (lostGame) return;
    if (event.type === 'mouseup' && usingTouchDevice) return;

    dropScheduled = true;
}



function sceneSetup() {
    // background
    Composite.add(world, Bodies.rectangle(
        PLAY_AREA_WIDTH/2, (DROP_HEIGHT+PLAY_AREA_HEIGHT)/2, PLAY_AREA_WIDTH, DROP_HEIGHT+PLAY_AREA_HEIGHT, {
            render: { sprite: { texture: './img/bg.png' } },
            isStatic: true,
            collisionFilter: { mask: 2 }
        }
    ));

    // floor and walls
    const wallStyle = { fillStyle: '#F9F' };
    const wallWidth = 100;
    const totalHeight = PLAY_AREA_HEIGHT + DROP_HEIGHT;
    Composite.add(world, [
        Bodies.rectangle(PLAY_AREA_WIDTH/2, totalHeight + wallWidth/2, PLAY_AREA_WIDTH, wallWidth, { isStatic: true, render: wallStyle }),
        Bodies.rectangle(PLAY_AREA_WIDTH + wallWidth/2, totalHeight/2, wallWidth, totalHeight, { isStatic: true, render: wallStyle }),
        Bodies.rectangle(       - wallWidth/2, totalHeight/2, wallWidth, totalHeight, { isStatic: true, render: wallStyle }),
    ]);

    // sensor - anything that collided before cant touch this
    Composite.add(world, Bodies.rectangle(PLAY_AREA_WIDTH/2, (DROP_HEIGHT-DROP_BARRIER)/2, PLAY_AREA_WIDTH+60, DROP_HEIGHT, {
        isStatic: true,
        isSensor: true,
        render: { fillStyle: 'transparent' }//, strokeStyle: '#20082E', lineWidth: DROP_BARRIER }
    }));

    // init stack of static spheres
    for (let i = 0; i < BAG_ITEM_COUNT; i++) {
        pushSphereFromBag(nextDrops, bagNext()); 
    }
    Composite.add(world, nextDrops);
}

function endGame() {
    if (!lostGame) {
        document.getElementById('score-text').style.color = '#55ee33';
        lostGame = true;
        lostGameTimestamp = Common.now();
        dropScheduled = true;
    }
}

function drawOntop() {
    const ctx = render.context;
    let gradient = ctx.createLinearGradient(0, 2, 0, DROP_HEIGHT-DROP_BARRIER);
    gradient.addColorStop(0, '#20082E');
    gradient.addColorStop(1, '#20082E00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -2, PLAY_AREA_WIDTH, DROP_HEIGHT-DROP_BARRIER);

    if (!lostGame && nextDrops.bodies[0].bounds.max.y >= DROP_HEIGHT-DROP_BARRIER - 0.5) {
        gradient = ctx.createLinearGradient(0, DROP_HEIGHT, 0, PLAY_AREA_HEIGHT);
        gradient.addColorStop(0, '#DDE5A700');
        gradient.addColorStop(1, '#DDE5A710');
        ctx.fillStyle = gradient;
        const dropRadius = nextDrops.bodies[0].circleRadius ?? 14;
        ctx.fillRect(stackX -dropRadius, DROP_HEIGHT, dropRadius * 2, PLAY_AREA_HEIGHT);

        ctx.fillStyle = '#20082E90';
        ctx.fillRect(0, DROP_HEIGHT-DROP_BARRIER, PLAY_AREA_WIDTH, DROP_BARRIER);
    }
}

function spheresCollided(bodyA, bodyB) {
    // final stage cant merge
    if (bodyA.stage === SPHERES_CONFIG[SPHERES_CONFIG.length-1].stage) return;

    // already merging
    if (bodyA.removing || bodyB.removing) return;

    mergeSound.play();

    score += bodyA.points;
    document.getElementById('score-text').textContent = score;

    const newIndex = bodyA.stage;

    const ageSpheres = (bodyA.id < bodyB.id) ? {old: bodyA, new: bodyB} : {old: bodyB, new: bodyA};
    const newPosition = lerpVec(ageSpheres.old.position, ageSpheres.new.position, 0.3);
    const newVelocity = lerpVec(ageSpheres.old.velocity, ageSpheres.new.velocity, 0.3);
    bodyA.removing = true; 
    bodyB.removing = true;
    
    const mergedSphere = newSphere(newPosition, SPHERES_CONFIG[newIndex], false, 0.25);
    Body.setAngle(mergedSphere, meanAngleFromTwo(bodyA.angle, bodyB.angle));
    Body.setVelocity(mergedSphere, newVelocity);

    scheduledMerges.push({rem1: bodyA, rem2: bodyB, add: mergedSphere});
}

function lerpVec(vec1, vec2, amount) {
    return {
        x: vec1.x * amount + vec2.x * (1-amount),
        y: vec1.y * amount + vec2.y * (1-amount)
    }
}

function doPlannedMerges(mergesArray) {
    mergesArray.forEach((bodiesGroup) => {

        // console.log("before", world.bodies.map((body) => {return body.id} ));
        
        Composite.remove(world, bodiesGroup.rem1);
        Composite.remove(world, bodiesGroup.rem2);
        Composite.add(world, bodiesGroup.add);

        // console.log("rem", bodiesGroup.rem1.id, bodiesGroup.rem2.id, "add", bodiesGroup.add.id);
        // console.log("after", world.bodies.map((body) => {return body.id} ));
    });
    mergesArray.length = 0;
}

function updateStackState() {
    const drop_until = DROP_HEIGHT - DROP_BARRIER;

    // apply every x ms
    if (Common.now() >= lastTickTime + 1 && nextDrops.bodies.length > 0) {

        const stackLowerEdge = nextDrops.bodies[0].bounds.max.y;
        
        if (stackLowerEdge < drop_until) {
            ticksToNextDrop--;
            if (ticksToNextDrop <= 0) Composite.translate(nextDrops, {x: 0, y: 5});
        } else {
            ticksToNextDrop = 10;
            if (stackLowerEdge !== drop_until) Composite.translate(nextDrops, {x: 0, y: drop_until - stackLowerEdge});
        }

        lastTickTime = Common.now();
    }

    // drop lowest
    if (dropScheduled && nextDrops.bodies[0].bounds.max.y >= drop_until - 0.5) {
        dropSphereFromStack();
    }
    if (!lostGame) dropScheduled = false;
}

function dropSphereFromStack() {
    if (nextDrops.bodies.length === 0) return;

    // turn on physics, transfer to world
    const lowestSphere = nextDrops.bodies[0];
    Body.setStatic(lowestSphere, false);
    Composite.move(nextDrops, lowestSphere, world);

    // play sound
    if (lowestSphere.sound !== undefined) lowestSphere.sound.play();
    
    // move stack - just in case the next sphere is wider and the stack was on the side
    if (nextDrops.bodies.length > 0) moveStackX(inputX);
}

function newSphere(pos, pickedProperties, isStatic, growPercent) {
    const startRadius = pickedProperties.radius;
    const sphere = Bodies.circle(pos.x, pos.y, startRadius, {
        density: pickedProperties.density,
        friction: pickedProperties.friction,
        restitution: pickedProperties.restitution,
        render: { 
            sprite: { texture: './img/ball'+pickedProperties.stage+'.png' }
        },
        isStatic,
        // collisionFilter: { group: -1 },
        stage: pickedProperties.stage,
        points: pickedProperties.points,
        sound: pickedProperties.sound
    });
    if (growPercent !== undefined) { 
        Body.scale(sphere, growPercent, growPercent);
        sphere.render.sprite.xScale = 2 - growPercent;
        sphere.render.sprite.yScale = 2 - growPercent;
        sphere.growPercent = growPercent; 
    };
    return sphere;
}


function bagNext() {
    if (randomBag.length === 0) {
        randomBag = Common.shuffle(SPHERES_CONFIG.slice(0, BAG_ITEM_COUNT));
    }
    return randomBag.shift();
}

function meanAngleFromTwo(radA, radB) {
    const radMean = Math.atan2(
        (Math.sin(radA) + Math.sin(radB)) / 2, 
        (Math.cos(radA) + Math.cos(radB)) / 2
    );
    return radMean ?? 0;
}

function pushSphereFromBag(dest, pickedProperties) {
    let prevTop = DROP_HEIGHT - DROP_BARRIER;
    if (dest.bodies.length > 0) {
        prevTop = dest.bodies[dest.bodies.length-1].position.y;
        prevTop -= dest.bodies[dest.bodies.length-1].circleRadius;
    }
    const pos = { 
        x: PLAY_AREA_WIDTH/2, 
        y: prevTop - pickedProperties.radius
    };

    Composite.add(dest, newSphere(pos, pickedProperties, true));
}

function moveStackX(newX) {
    const bounds = nextDrops.bodies[0].circleRadius ?? 0;
    newX = Math.max(newX, bounds);
    newX = Math.min(newX, PLAY_AREA_WIDTH - bounds);

    stackX = newX;

    for (const body of nextDrops.bodies) {
        Body.setPosition(body, {x: stackX, y: body.position.y})
    }
}

