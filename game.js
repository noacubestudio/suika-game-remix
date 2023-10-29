// config
const DROP_HEIGHT = 150;
const DROP_BARRIER = 10;
const PLAY_AREA_HEIGHT = 600; // make sure to also update the css
const PLAY_AREA_WIDTH = 500;

const GRAVITY_MULT = 1.2;
const TICKS_UNTIL_STACK_FOLLOW = 10;
const MS_UNTIL_LOST = 2000;
const MS_UNTIL_MERGE = 300;
const MERGE_LERP_BIAS = 0.3 // 0 means the older/lower sphere, 1 means the newer/higher sphere

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
    const currentDate = d.getMonth() * 100 + d.getDate();
    const currentHour = d.getHours();
    return currentDate * 100 + currentHour;
})();
document.getElementById('seed').textContent = "Seed " + Common._seed;

// create renderer
//const canvas_old = document.getElementById('canvas-container');
// const render = Render.create({
//     canvas: canvas,
//     engine: engine,
//     options: {
//         width: PLAY_AREA_WIDTH,
//         height: PLAY_AREA_HEIGHT + DROP_HEIGHT,
//         background: '#4A1D60',
//         wireframes: false,
//         // showCollisions: true,
//         // showDebug: true,
//     }
// });
// Render.run(render);


// set up rendering

const mainCanvas = document.getElementById('canvas-container');
const mainCtx = mainCanvas.getContext('2d');
mainCanvas.width = PLAY_AREA_WIDTH;
mainCanvas.height = PLAY_AREA_HEIGHT + DROP_HEIGHT;
const testSprites = {};
testSprites.bg = new Image();
    testSprites.bg.src = './img/bg.png';
testSprites.sphere = Array.from({ length: 11 }, (_, index) => {
    const img = new Image();
    img.src = `./img/ball${index + 1}.png`;
    return img;
});



// create runner, simple gameloop
const runner = Runner.create({
    isFixed: true,
});
Runner.run(runner, engine);


// composites
const compDrops = Composite.create();
const compWorld = Composite.create();

// game state
let randomBag = [];
let dropScheduled = false;
let scheduledMerges = [];
let ticksToNextDrop = 10;
let inputX = null;
let stackX = PLAY_AREA_WIDTH / 2;
let score = 0;
let lostGame = false;
let lostGameTimestamp = null;
let reachedTopTimestamp = null;
let ticksCountdownUntilFollow = null;
let highestID = 0;


// construct walls, initial stack of spheres
sceneSetup();



// slowly drop stack
Events.on(engine, 'beforeUpdate', (event) => {

    // do merges
    scheduledMerges = advancePlannedMerges(scheduledMerges);


    // drop stack of spheres above the lowest to follow
    if (compDrops.bodies.length > 0) {
        updateStackState();
    } else {
        dropScheduled = false;
    }

    // if (lostGame && Common.now() - lostGameTimestamp > 4000) {
    //     Runner.stop(runner);
    // }

    // check bounds
    const droppedSpheresTopY = (compWorld.bodies.length > 0) ? Composite.bounds(compWorld).min.y : Infinity;
    
    if (droppedSpheresTopY <= DROP_HEIGHT) {
        if (reachedTopTimestamp === null) {
            // initial reach
            reachedTopTimestamp = Common.now();
        } else {
            if (Common.now() - reachedTopTimestamp > MS_UNTIL_LOST) endGame();
        }
    } else {
        // all spheres are lower
        reachedTopTimestamp = null;
    }
});

Events.on(engine, 'afterUpdate', (event) => { renderSceneToCanvas(mainCtx) });

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        // try merge if neither are static and both are the same kind of circle
        if (pair.bodyA.stage === pair.bodyB.stage && pair.bodyA.isStatic === pair.bodyB.isStatic) {
            spheresCollided(pair.bodyA, pair.bodyB);
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
    pushSphereFromBag(compDrops, bagNext()); 
    dropScheduled = true;
}

function startedTouch(event) {
    event.preventDefault();
    if (lostGame) return;
    if (event.type === 'touchstart') usingTouchDevice = true;
    if (event.type === 'mousedown' && usingTouchDevice) return;

    pushSphereFromBag(compDrops, bagNext()); 

    const pos = (event.touches !== undefined) ? event.touches[0] : event;
    const rect = mainCanvas.getBoundingClientRect();
    const scaledX = (pos.clientX - rect.left) / rect.width;
    inputX = scaledX * PLAY_AREA_WIDTH;
    moveStackX(inputX);
}

function movedTouch(event) {
    event.preventDefault();
    if (event.type === 'mousemove' && usingTouchDevice) return;
    if (lostGame) return;

    const pos = (event.touches !== undefined) ? event.touches[0] : event;
    const rect = mainCanvas.getBoundingClientRect();
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
        pushSphereFromBag(compDrops, bagNext()); 
    }
    Composite.add(world, compDrops);

    // composite for the dropped spheres
    Composite.add(world, compWorld);
}

function endGame() {
    if (!lostGame) {
        document.getElementById('score-text').style.color = '#55ee33';
        lostGame = true;
        lostGameTimestamp = Common.now();
        dropScheduled = true;
    }
}

function renderSceneToCanvas(ctx) {

    ctx.clearRect(0, 0, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT + DROP_HEIGHT);

    // background
    ctx.drawImage(testSprites.bg, 0, 0);

    // line to indicate where you next drop
    if (!lostGame && compDrops.bodies[0].bounds.max.y >= DROP_HEIGHT-DROP_BARRIER - 0.5) { 
        let gradient = ctx.createLinearGradient(0, DROP_HEIGHT, 0, PLAY_AREA_HEIGHT);
        gradient.addColorStop(0, '#DDE5A700');
        gradient.addColorStop(1, '#DDE5A725');
        ctx.fillStyle = gradient;
        const dropRadius = compDrops.bodies[0].circleRadius ?? 14;
        ctx.fillRect(stackX -dropRadius, DROP_HEIGHT, dropRadius * 2, PLAY_AREA_HEIGHT);
    }

    // foreground

    compDrops.bodies.forEach((body) => {
        renderSphereBody(ctx, body);
    });

    compWorld.bodies.forEach((body) => {
        renderSphereBody(ctx, body);
    });

    function renderSphereBody(ctx, body) {
        const r = body.circleRadius * (body.growPercent ?? 1);
        let p = { x: body.position.x, y: body.position.y };

        if (body.removeTimestamp !== undefined && !body.destination) {
            const mergeDonePercent = (Common.now() - body.removeTimestamp) / MS_UNTIL_MERGE;
            const mergeCurve = (Math.max(0, mergeDonePercent - 0.5) * 2) ** 4; // wait half the merge wait time, then accelerate towards destination
            const destPosition = body.mergeTarget.position;
            const currentMergePosition = lerpVec(p, destPosition, mergeCurve * (1-MERGE_LERP_BIAS));
            p = currentMergePosition;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(body.angle)
        ctx.drawImage(testSprites.sphere[body.stage - 1], - r, - r, r * 2, r * 2);
        // ctx.fillStyle = 'black';
        // ctx.fillText(body.dropID ?? '', 0, 0)
        ctx.restore();
    }

    // function ctxCircle(context, centerX, centerY, radius, fillColor) {
    //     // Draw the circle
    //     context.beginPath();
    //     context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    //     context.fillStyle = fillColor;
    //     context.fill();
    //     context.closePath();
    // }

    // in front of everything
    let gradient = ctx.createLinearGradient(0, 2, 0, DROP_HEIGHT-DROP_BARRIER);
    gradient.addColorStop(0, '#20082E');
    gradient.addColorStop(1, '#20082E00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -2, PLAY_AREA_WIDTH, DROP_HEIGHT-DROP_BARRIER);

    if (!lostGame && compDrops.bodies[0].bounds.max.y >= DROP_HEIGHT-DROP_BARRIER - 0.5) {
        ctx.fillStyle = '#20082E90';
        ctx.fillRect(0, DROP_HEIGHT-DROP_BARRIER, PLAY_AREA_WIDTH, DROP_BARRIER);

        if (reachedTopTimestamp !== null) {
            const intensity = (Common.now() - reachedTopTimestamp) / MS_UNTIL_LOST;
            const blinkRed = Math.sin(Common.now() / 30);
            ctx.fillStyle = `rgba(255, 0, 0, ${blinkRed * intensity})`;;
            ctx.fillRect(0, DROP_HEIGHT-DROP_BARRIER, PLAY_AREA_WIDTH, DROP_BARRIER);
        }
        
    }
}

function spheresCollided(bodyA, bodyB) {

    // already merging
    if (bodyA.removeTimestamp || bodyB.removeTimestamp) return;

    // mark which one should be the destination and which one mostly moves
    const condition = (bodyA.dropID === highestID || bodyB.dropID === highestID) // if one was last dropped
        ? (bodyA.dropID < bodyB.dropID) // compare age
        : (bodyA.position.y > bodyB.position.y); // mark lower one as older
    const ageSpheres = condition ? {old: bodyA, new: bodyB} : {old: bodyB, new: bodyA};
    ageSpheres.old.destination = true;
    ageSpheres.old.mergeTarget = ageSpheres.new;
    ageSpheres.new.mergeTarget = ageSpheres.old;

    // mark as removed remove
    bodyA.removeTimestamp = Common.now(); 
    bodyB.removeTimestamp = Common.now();
    scheduledMerges.push({orderedBodies: [ageSpheres.old, ageSpheres.new], timestamp: Common.now()});
}

function lerpVec(vec1, vec2, amount) {
    return {
        x: vec1.x * (1-amount) + vec2.x * amount,
        y: vec1.y * (1-amount) + vec2.y * amount
    }
}

function advancePlannedMerges(mergesArray) {

    const newArray = [];
    mergesArray.forEach((bodiesGroup) => {

        // final moment, do the merge
        if (Common.now() - bodiesGroup.timestamp >= MS_UNTIL_MERGE) {

            const a = bodiesGroup.orderedBodies[0]; const b = bodiesGroup.orderedBodies[1];

            // fx
            mergeSound.play();
            score += a.points;
            document.getElementById('score-text').textContent = score;

            // add, only if not biggest stage of circles
            if (a.stage !== SPHERES_CONFIG[SPHERES_CONFIG.length-1].stage) {
                const newPosition = lerpVec(a.position,b.position, MERGE_LERP_BIAS);
                const newVelocity = lerpVec(a.velocity, b.velocity, MERGE_LERP_BIAS);

                const mergedSphere = newSphere(newPosition, SPHERES_CONFIG[a.stage], false);
                mergedSphere.dropID = -1;
                Body.setAngle(mergedSphere, meanAngleFromTwo(a.angle, b.angle));
                Body.setVelocity(mergedSphere, newVelocity);
                bodiesGroup.add = mergedSphere;
            } 

            // time to merge
            Composite.remove(compWorld, a);
            Composite.remove(compWorld, b);
            if (bodiesGroup.add !== undefined) {
                Composite.add(compWorld, bodiesGroup.add);
            }
            // console.log("before", compWorld.bodies.map((body) => {return body.id} ));
            // console.log("rem", bodiesGroup.a.id, bodiesGroup.rem2.id, "add", bodiesGroup.add.id);
            // console.log("after", compWorld.bodies.map((body) => {return body.id} ));

        } else {
            // add back
            newArray.push(bodiesGroup);
        }
    });
    return newArray;
}

function updateStackState() {
    const drop_until = DROP_HEIGHT - DROP_BARRIER;

    // rest follow if lowest one has been dropped, with a bit of a delay
    if (ticksCountdownUntilFollow !== null) {
        ticksCountdownUntilFollow--;
        if (ticksCountdownUntilFollow <= 0) {
            const stackLowerEdge = compDrops.bodies[0].bounds.max.y;
            if (stackLowerEdge < drop_until) {
                Composite.translate(compDrops, {x: 0, y: 5});
            } else {
                if (stackLowerEdge !== drop_until) Composite.translate(compDrops, {x: 0, y: drop_until - stackLowerEdge});
                ticksCountdownUntilFollow = null;
            }
        }
    }

    // drop lowest
    if (dropScheduled && compDrops.bodies[0].bounds.max.y >= drop_until - 0.5) {
        dropSphereFromStack();
        if (compDrops.bodies.length > 0) ticksCountdownUntilFollow = TICKS_UNTIL_STACK_FOLLOW;
    }

    if (!lostGame) dropScheduled = false;
}

function dropSphereFromStack() {
    if (compDrops.bodies.length === 0) return;

    // turn on physics, transfer to comp World
    const lowestSphere = compDrops.bodies[0];
    Body.setStatic(lowestSphere, false);
    Composite.move(compDrops, lowestSphere, compWorld);
    lowestSphere.dropID = highestID;
    highestID++;

    // play sound
    if (lowestSphere.sound !== undefined) lowestSphere.sound.play();
    
    // move stack - just in case the next sphere is wider and the stack was on the side
    if (compDrops.bodies.length > 0) moveStackX(inputX);
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
    // if (growPercent !== undefined) { 
    //     //Body.scale(sphere, growPercent, growPercent);
    //     // sphere.render.sprite.xScale = 2 - growPercent;
    //     // sphere.render.sprite.yScale = 2 - growPercent;
    //     //sphere.growPercent = growPercent; 
    // };
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
    if (dest.bodies.length >= 5) return;

    let prevTop = DROP_HEIGHT - DROP_BARRIER;
    if (dest.bodies.length > 0) {
        prevTop = dest.bodies[dest.bodies.length-1].position.y;
        prevTop -= dest.bodies[dest.bodies.length-1].circleRadius;
    }
    const pos = { 
        x: PLAY_AREA_WIDTH/2, 
        y: prevTop - pickedProperties.radius
    };

    const addedSphere = newSphere(pos, pickedProperties, true);
    Body.setAngle(addedSphere, Common.shuffle([-0.02, 0.02, -0.04, 0.04])[0]*Math.PI);
    Composite.add(dest, addedSphere);
}

function moveStackX(newX) {
    const bounds = compDrops.bodies[0].circleRadius ?? 0;
    newX = Math.max(newX, bounds);
    newX = Math.min(newX, PLAY_AREA_WIDTH - bounds);

    stackX = newX;

    compDrops.bodies.forEach((body, index) => {
        if (ticksCountdownUntilFollow === null) { // not in midair
            const dir = (index % 2 === 0) ? 1 : -1;
            const deltaPosX = stackX - body.position.x;
            const rotAngle = Math.PI * (deltaPosX / body.circleRadius) * 0.5 * dir;
            Body.setAngle(body, body.angle + rotAngle % (Math.PI * 2));
        }

        Body.setPosition(body, {x: stackX, y: body.position.y});
        
    });
}

