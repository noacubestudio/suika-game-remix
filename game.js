// config
const DROP_HEIGHT = 100;
const PLAY_AREA_HEIGHT = 550;
const PLAY_AREA_WIDTH = 500;
const SPHERES_CONFIG = [
    { stage: 1, radius: 14, points:  2, density: 0.15, friction: 0.5 },
    { stage: 2, radius: 20, points:  4, density: 0.2, friction: 0.5 },
    { stage: 3, radius: 30, points:  6, density: 0.1, friction: 0.5 },
    { stage: 4, radius: 40, points: 10, density: 0.1, friction: 0.5 },
    { stage: 5, radius: 54, points: 16, density: 0.1, friction: 0.5 },
    { stage: 6, radius: 66, points: 26, density: 0.1, friction: 0.5 },
    { stage: 7, radius: 80, points: 42, density: 0.1, friction: 0.5 },
    { stage: 8, radius:100, points: 68, density: 0.1, friction: 0.5 },
    { stage: 9, radius:120, points:110, density: 0.1, friction: 0.5 },
    { stage:10, radius:140, points:500, density: 0.1, friction: 0.5 },
    { stage:11, radius:160, points:999, density: 0.1, friction: 0.5 },
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
engine.gravity.scale = 0.0015; // 0.001 is default
const world = engine.world;

Common._seed = (() => {
    
    const d = new Date();
    const fulldate = d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
    const currentHour = d.getHours();
    return fulldate * 100 + currentHour;
})();
document.getElementById('seed').textContent = "Seed " + Common._seed;

// create renderer
const render = Render.create({
    canvas: document.getElementById('canvas-container'),
    engine: engine,
    options: {
        width: PLAY_AREA_WIDTH,
        height: PLAY_AREA_HEIGHT + DROP_HEIGHT,
        background: '#372440',
        wireframes: false,
        // showCollisions: true,
        // showDebug: true,
    }
});

Render.run(render);

// create runner
const runner = Runner.create();
Runner.run(runner, engine);

// add mouse control
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
        stiffness: 0.2,
        render: {
            visible: true
        }
    },
    collisionFilter: { mask: 0x002 }
});
Composite.add(world, mouseConstraint);

// keep mouse in sync with rendering
render.mouse = mouse;




// state
let randomBag = [];
const nextDrops = Composite.create();
let ticksToNextDrop = 10;
let score = 0;
let lostGame = false;
let lastTickTime = Common.now();
// input
let mouseIsDown = false;


sceneSetup();



// slowly drop stack
Events.on(engine, 'beforeUpdate', (event) => {

    // apply every x ms
    if (Common.now() >= lastTickTime + 1) {

        const stackLowerEdge = nextDrops.bodies[0].bounds.max.y
        if (stackLowerEdge < DROP_HEIGHT) {
            ticksToNextDrop--;
            if (ticksToNextDrop <= 0) Composite.translate(nextDrops, {x: 0, y: 5});
        } else {
            ticksToNextDrop = 10;
            if (stackLowerEdge !== DROP_HEIGHT) Composite.translate(nextDrops, {x: 0, y: DROP_HEIGHT - stackLowerEdge});
        }

        lastTickTime = Common.now();
    }

    // grow
    for (const body of world.bodies) {
        if (body.growPercent < 1) {
            body.growPercent *= 2;
            Body.scale(body, 2, 2);
            body.render.sprite.xScale = 2 - body.growPercent;
            body.render.sprite.yScale = 2 - body.growPercent;
            if (body.growPercent >= 1) {
                body.growPercent = undefined;
            }
        }
    }
});

Events.on(engine, 'afterUpdate', (event) => {
    const ctx = render.context;
    const gradient = ctx.createLinearGradient(0, 2, 0, DROP_HEIGHT);
    gradient.addColorStop(0, '#372440');
    gradient.addColorStop(1, '#37244000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -2, PLAY_AREA_WIDTH, DROP_HEIGHT);
});

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
            if (Common.now() - pair.bodyB.dangerStartTime > 1000) endGame();
        } else if (pair.bodyB.isSensor && !pair.bodyA.isStatic) {
            if (Common.now() - pair.bodyA.dangerStartTime > 1000) endGame();
        }
    });
});

Events.on(mouseConstraint, 'mousedown', (event) => {
    if (lostGame) return;
    mouseIsDown = true;
    pushSphereFromBag(nextDrops, bagNext()); 
    moveStackX(event.mouse.position.x);
});

Events.on(mouseConstraint, 'mouseup', () => {
    if (lostGame) return;
    mouseIsDown = false;
    dropSphereFromStack()
});

Events.on(mouseConstraint, 'mousemove', (event) => {
    if (lostGame) return;
    moveStackX(event.mouse.position.x);
});



function sceneSetup() {
    // floor and walls
    const wallStyle = { fillStyle: '#F9F' };
    const wallWidth = 20;
    const totalHeight = PLAY_AREA_HEIGHT + DROP_HEIGHT;
    Composite.add(world, [
        Bodies.rectangle(PLAY_AREA_WIDTH/2, totalHeight, PLAY_AREA_WIDTH, wallWidth, { isStatic: true, render: wallStyle }),
        Bodies.rectangle(PLAY_AREA_WIDTH, totalHeight/2, wallWidth, totalHeight, { isStatic: true, render: wallStyle }),
        Bodies.rectangle(       0, totalHeight/2, wallWidth, totalHeight, { isStatic: true, render: wallStyle }),
    ]);

    // sensor - anything that collided before cant touch this
    Composite.add(world, Bodies.rectangle(PLAY_AREA_WIDTH/2, DROP_HEIGHT/2, PLAY_AREA_WIDTH, DROP_HEIGHT, {
        isStatic: true,
        isSensor: true,
        render: { fillStyle: '#FF99FF30' }
    }));

    // init stack of static spheres
    for (let i = 0; i < 4; i++) {
        pushSphereFromBag(nextDrops, bagNext()); 
    }
    Composite.add(world, nextDrops);
}

function endGame() {
    document.getElementById('score-text').style.color = '#55ee33';
    lostGame = true;
}

function spheresCollided(bodyA, bodyB) {
    if (bodyA.stage === SPHERES_CONFIG[SPHERES_CONFIG.length-1].stage) return;
    if (bodyA.removing || bodyB.removing) return;

    score += bodyA.points;
    mergeSound.play();
    document.getElementById('score-text').textContent = score;
    const newIndex = bodyA.stage;
    const newPosition = {
        x: (bodyA.position.x + bodyB.position.x) / 2,
        y: (bodyA.position.y + bodyB.position.y) / 2
    };
    bodyA.removing = true; bodyB.removing = true;

    // console.log("REM!", (bodyA.stage-1) + " @" + bodyA.id);
    // console.log("REM!", (bodyB.stage-1) + " @" + bodyB.id);
    Composite.remove(world, [bodyA, bodyB]);
    
    const mergedSphere = newSphere(newPosition, SPHERES_CONFIG[newIndex], false, 0.25);
    Body.setAngle(mergedSphere, meanAngleFromTwo(bodyA.angle, bodyB.angle));
    // console.log("ADD!", newIndex + " @" + mergedSphere.id);

    Composite.add(world, mergedSphere);
}

function dropSphereFromStack() {
    if (nextDrops.bodies.length > 0) {
        const lowestSphere = nextDrops.bodies[0];
        
        if (lowestSphere !== undefined) {
            Body.setStatic(lowestSphere, false);
            Composite.move(nextDrops, lowestSphere, world);
            // console.log('-', (lowestSphere.stage-1) + " @" + lowestSphere.id, '-');
        }
    }
}

function newSphere(pos, pickedProperties, isStatic, growPercent) {
    const startRadius = pickedProperties.radius;
    const sphere = Bodies.circle(pos.x, pos.y, startRadius, {
        density: pickedProperties.density,
        friction: pickedProperties.friction,
        restitution: 0.1,
        render: { 
            sprite: { texture: './img/ball'+pickedProperties.stage+'.png' }
        },
        isStatic,
        // collisionFilter: { group: -1 },
        stage: pickedProperties.stage,
        points: pickedProperties.points,
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
        randomBag = Common.shuffle(SPHERES_CONFIG.slice(0, 4));
        // randomBag = Common.shuffle(SPHERES_CONFIG.slice(7, 8));
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
    let prevTop = DROP_HEIGHT;
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
    const bounds = 50;
    newX = Math.max(newX, bounds);
    newX = Math.min(newX, PLAY_AREA_WIDTH - bounds);

    for (const body of nextDrops.bodies) {
        Body.setPosition(body, {x: newX, y: body.position.y})
    }
}

