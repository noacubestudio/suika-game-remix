// config
const DROP_HEIGHT = 150;
const DROP_BARRIER = 10;
const PLAY_AREA_HEIGHT = 600; // make sure to also update the css
const PLAY_AREA_WIDTH = 500;

const GRAVITY_MULT = 1.2;
const MERGE_LERP_BIAS = 0.3 // 0 means the older/lower sphere, 1 means the newer/higher sphere


const TICKS_UNTIL_SPHERES_FOLLOW = 10;
const TICKS_UNTIL_LOST = 150;
const TICKS_UNTIL_MERGE = 20;
const TICKS_AFTER_MERGE_EFFECT = 40;
let currentTick = 0;
let tickWhereLastSphereDropped = null;
let tickWhereTopLastReached = null;

const BASE_WOOSH = new Audio('woosh-01.wav');
const BAG_ITEM_COUNT = 5;
const SPHERES_CONFIG = [
    { stage:  1, radius:  14, points:   2, density: 0.3 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-01.wav') },
    { stage:  2, radius:  20, points:   4, density: 0.25, friction: 0.2, restitution: 0.15, sound: new Audio('woosh-02.wav') },
    { stage:  3, radius:  30, points:   6, density: 0.2 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-03.wav') },
    { stage:  4, radius:  40, points:  10, density: 0.2 , friction: 0.2, restitution: 0.15, sound: new Audio('woosh-04.wav') },
    { stage:  5, radius:  54, points:  16, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
    { stage:  6, radius:  66, points:  26, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
    { stage:  7, radius:  80, points:  42, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
    { stage:  8, radius: 100, points:  68, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
    { stage:  9, radius: 120, points: 110, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
    { stage: 10, radius: 140, points: 500, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
    { stage: 11, radius: 160, points: 999, density: 0.2 , friction: 0.2, restitution: 0.15, sound: BASE_WOOSH },
];
// const POWERUP_CONFIG = {
//     collect: { radius: 14, density: 0.3, friction: 0.2, restitution: 0.15, sound: BASE_WOOSH }
// }

// load
const mergeSound = new Audio('merge-pop.wav');
const mergeSound2 = new Audio('merge-pop.wav');

// font
// const canvasFont = new FontFace('Sono', 'url(Sono-Variable.ttf)');
// canvasFont.load().then((loadedFont) => {
//     document.fonts.add(loadedFont);
//     mainCtx.font = 'bold 48px Sono';
// });

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
    Constraint = Matter.Constraint,
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
document.getElementById('seed').textContent = "Seed: " + Common._seed;


// set up rendering
const mainCanvas = document.getElementById('canvas-container');
const mainCtx = mainCanvas.getContext('2d');
mainCanvas.width = PLAY_AREA_WIDTH;
mainCanvas.height = PLAY_AREA_HEIGHT + DROP_HEIGHT;
const ctxSprites = {};
ctxSprites.bg = new Image();
    ctxSprites.bg.src = './img/bg.png';
ctxSprites.sphere = Array.from({ length: 11 }, (_, index) => {
    const img = new Image();
    img.src = `./img/ball${index + 1}.png`;
    return img;
});
// ctxSprites.powerup = {
//     collect: new Image()
// }
// ctxSprites.powerup.collect.src = `./img/powerup_${'collect'}.png`;

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
let plannedMergesAtDestination = new Map();
let recentMerges = [];

let inputX = null;
let stackX = PLAY_AREA_WIDTH / 2;
let score = 0;
let scoreSinceLastDrop = 0;
let highestCombo = 0;
let mergesSinceLastDrop = 0;
let lostGame = false;
let highestID = 0;


// construct walls, initial stack of spheres
sceneSetup();



// slowly drop stack
Events.on(engine, 'beforeUpdate', (event) => {

    // do merges
    finalizeOldPlannedMerges();


    // drop stack of spheres above the lowest to follow
    if (compDrops.bodies.length > 0) {
        updateStackState();
    } else {
        dropScheduled = false;
    }

    // check bounds
    const droppedSpheresTopY = (compWorld.bodies.length > 0) ? Composite.bounds(compWorld).min.y : Infinity;
    
    if (droppedSpheresTopY <= DROP_HEIGHT) {
        if (tickWhereTopLastReached === null) {
            // initial reach
            tickWhereTopLastReached = currentTick;
        } else {
            if (currentTick - tickWhereTopLastReached > TICKS_UNTIL_LOST) endGame();
        }
    } else {
        // all spheres are lower
        tickWhereTopLastReached = null;
    }

    currentTick += 1;
});

Events.on(engine, 'afterUpdate', (event) => { renderSceneToCanvas(mainCtx) });

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        // try merge if neither are static and both are the same kind of circle
        if (pair.bodyA.stage === pair.bodyB.stage && pair.bodyA.isStatic === pair.bodyB.isStatic) {
            droppedSameSpheresCollided(pair.bodyA, pair.bodyB);
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
        dropScheduled = true;
    }
}

function renderSceneToCanvas(ctx) {

    ctx.clearRect(0, 0, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT + DROP_HEIGHT);
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.lineCap = "round";

    // background
    ctx.drawImage(ctxSprites.bg, 0, 0);

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
    ctx.fillStyle = "#20082EA0";
    compDrops.bodies.forEach((body) => { renderSphereShadow(ctx, body); });
    compWorld.bodies.forEach((body) => { renderSphereShadow(ctx, body); });

    compDrops.bodies.forEach((body, index) => { renderSphereBody(ctx, body, index); });
    compWorld.bodies.forEach((body) => { renderSphereBody(ctx, body); });

    // remove info about merges that are no longer recent, 
    // then display effects/score popping up for the recent ones
    let finishedMerges = 0;
    for (mergeObject of recentMerges)  {
        const animPercentage = (currentTick - mergeObject.tick) / TICKS_AFTER_MERGE_EFFECT;
        if (animPercentage < 1) break;
        finishedMerges++;
    }
    if (finishedMerges > 0) {
        recentMerges = recentMerges.slice(finishedMerges);
        //console.log("removed", finishedMerges, "now", recentMerges.length)
    }
    recentMerges.forEach((mergeObject) => renderMergeEffect(ctx, mergeObject));

    function renderSphereShadow(ctx, body) {
        const r = body.circleRadius + 4;
        let p = { x: body.position.x, y: body.position.y};

        // animate towards merge destination
        if (body.mergeDestination !== undefined) {
            const mergeDonePercent = (currentTick - body.tickWhereCollided) / TICKS_UNTIL_MERGE;
            const mergeCurve = (Math.max(0, mergeDonePercent - 0.5) * 2) ** 4; // wait half the merge wait time, then accelerate towards destination
            const destPosition = body.mergeDestination.position;
            const currentMergePosition = lerpVec(p, destPosition, mergeCurve * (1-MERGE_LERP_BIAS));
            p = currentMergePosition;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
        ctx.fill();
    }

    function renderSphereBody(ctx, body) {
        const r = body.circleRadius;
        let p = { x: body.position.x, y: body.position.y };

        // animate towards merge destination
        if (body.mergeDestination !== undefined) {
            const mergeDonePercent = (currentTick - body.tickWhereCollided) / TICKS_UNTIL_MERGE;
            const mergeCurve = (Math.max(0, mergeDonePercent - 0.5) * 2) ** 4; // wait half the merge wait time, then accelerate towards destination
            const destPosition = body.mergeDestination.position;
            const currentMergePosition = lerpVec(p, destPosition, mergeCurve * (1-MERGE_LERP_BIAS));
            p = currentMergePosition;
        }

        ctx.save();
        ctx.translate(p.x, p.y);

        const visualRotationAdd = (p.x / body.circleRadius) * Math.PI * 0.5;
        ctx.rotate(body.angle + visualRotationAdd);
        const sprite = ctxSprites.sphere[body.stage - 1];
        const spriteScale = 0.5;
        ctx.drawImage(sprite, - sprite.width * spriteScale * 0.5, - sprite.height * spriteScale * 0.5, sprite.width * spriteScale, sprite.height * spriteScale);
        // ctx.fillStyle = 'black';
        // ctx.fillText(body.dropID ?? '', 0, 0)
        if (body.tickWhereCollided !== undefined) {
            const mergeAnimPercentage = (currentTick - body.tickWhereCollided) / TICKS_UNTIL_MERGE;
            ctx.fillStyle = (Math.sin((mergeAnimPercentage*4) ** 2) > 0) ? '#ffffff' : '#ffffff20';
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.restore();

        ctx.lineWidth = r*0.4;
        ctx.strokeStyle = '#ffffff50'
        ctx.globalCompositeOperation = 'soft-light'
        ctx.beginPath();
        ctx.arc(p.x, p.y, r*0.8, Math.PI*1.1, Math.PI*1.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r*0.8, Math.PI*1.3, Math.PI*1.4);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.globalCompositeOperation = 'source-over'
    }

    function renderMergeEffect(ctx, mergeObject) {
        const animPercentage = (currentTick - mergeObject.tick) / TICKS_AFTER_MERGE_EFFECT;
        if (animPercentage > 1) return;

        ctx.save();
        const p = {
            x: mergeObject.position.x ?? PLAY_AREA_WIDTH  * 0.5, 
            y: mergeObject.position.y ?? PLAY_AREA_HEIGHT * 0.2
        }
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = 1.0 - animPercentage;
        ctx.fillStyle = (mergeObject.addedScore > 20) ? '#ffff77' : '#77ff99';
        ctx.strokeStyle = 'black';
        ctx.strokeText("+" + mergeObject.addedScore, 0, - animPercentage * 200);
        ctx.fillText("+" + mergeObject.addedScore, 0, - animPercentage * 200);
       
        const easedPercentage = easeOutExpo(animPercentage);
        ctx.strokeStyle = 'white';
        ctx.globalAlpha = 1.0 - easedPercentage;
        ctx.beginPath();
        ctx.arc(0, 0, mergeObject.circleRadius * (1.0 + easedPercentage * 0.5), 0, Math.PI*2);
        ctx.stroke();
        if (mergeObject.wasTripleMerge) {
            ctx.beginPath();
            ctx.arc(0, 0, mergeObject.circleRadius * (1.0 + easedPercentage * 1), 0, Math.PI*2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
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

        if (tickWhereTopLastReached !== null) {
            const intensity = (currentTick - tickWhereTopLastReached) / TICKS_UNTIL_LOST;
            const blinkRed = Math.sin(currentTick / 4);
            ctx.fillStyle = `rgba(255, 0, 0, ${blinkRed * intensity})`;;
            ctx.fillRect(0, DROP_HEIGHT-DROP_BARRIER, PLAY_AREA_WIDTH, DROP_BARRIER);
        }
        
    }
}

function droppedSameSpheresCollided(bodyA, bodyB) {

    // already merging
    if (bodyA.tickWhereCollided || bodyB.tickWhereCollided) {
        if (bodyA.inTripleMerge || bodyB.inTripleMerge) {
            //console.log("already in triple merge, won't add to quadruple merge")
            return; // already in triple merge
        }
        if (bodyA.tickWhereCollided === undefined) {
            // bodyB now has a new merge partner
            //console.log("todo new merge for body B", bodyA, bodyB)
            mergeNewWithExistingMergePartner(bodyA, bodyB);
        } else if (bodyB.tickWhereCollided === undefined) {
            // bodyA now has a new merge partner
            //console.log("todo new merge for body A", bodyA, bodyB)
            mergeNewWithExistingMergePartner(bodyB, bodyA);
        }
        return; // both were already merging
    }

    // mark which one should be the destination and which one mostly moves
    const condition = (bodyA.dropID === highestID || bodyB.dropID === highestID) // if one was last dropped
        ? (bodyA.dropID < bodyB.dropID) // compare age
        : (bodyA.position.y > bodyB.position.y); // mark lower one as older
    const ageSpheres = condition ? {old: bodyA, new: bodyB} : {old: bodyB, new: bodyA};
    ageSpheres.new.mergeDestination = ageSpheres.old;

    // mark as merging, schedule the actual replacement of the bodies
    bodyA.tickWhereCollided = currentTick; 
    bodyB.tickWhereCollided = currentTick;
    plannedMergesAtDestination.set(ageSpheres.old, [ageSpheres.new]);
    //console.log('merge sources', plannedMergesAtDestination.get(ageSpheres.old));

    // add constraint between them to glue them until the merge actually happens
    const constraint = Constraint.create({
        bodyA: ageSpheres.old,
        bodyB: ageSpheres.new,
        stiffness: 0.2,
        damping: 0.5
    });

    Composite.add(compWorld, constraint);
}

function mergeNewWithExistingMergePartner(newBody, existingMergeBody) {
    // has a destination
    const mergeSources = [];
    if (existingMergeBody.mergeDestination !== undefined) {
        // flip which one is the destination in the existing merge partners first
        const otherBody = existingMergeBody.mergeDestination;
        existingMergeBody.mergeDestination = undefined;
        plannedMergesAtDestination.delete(otherBody);
        otherBody.mergeDestination = existingMergeBody;
        otherBody.inTripleMerge = true;
        mergeSources.push(otherBody);
    }
    // the existing merge body that was collided with again is now always the destination
    newBody.mergeDestination = existingMergeBody;
    newBody.tickWhereCollided = currentTick; //WIP, should really apply to all
    newBody.inTripleMerge = true;
    existingMergeBody.inTripleMerge = true;
    mergeSources.push(newBody);
    //plannedMergesAtDestination.get(existingMergeBody)
    //console.log("mergeDest", plannedMergesAtDestination.get(existingMergeBody))
    if (plannedMergesAtDestination.has(existingMergeBody)) {
        // add new body
        plannedMergesAtDestination.get(existingMergeBody).push(newBody);
    } else {
        plannedMergesAtDestination.set(existingMergeBody, mergeSources);
    }

    // add constraint between them to glue them until the merge actually happens
    const constraint = Constraint.create({
        bodyA: newBody,
        bodyB: existingMergeBody,
        stiffness: 0.2,
        damping: 0.5
    });

    Composite.add(compWorld, constraint);
}

function lerpVec(vec1, vec2, amount) {
    return {
        x: vec1.x * (1-amount) + vec2.x * amount,
        y: vec1.y * (1-amount) + vec2.y * amount
    }
}

function finalizeOldPlannedMerges() {

    plannedMergesAtDestination.forEach((mergeBodiesArr, mergeTarget) => {

        // final moment, do the merge
        if (currentTick - mergeTarget.tickWhereCollided >= TICKS_UNTIL_MERGE) {

            const dest = mergeTarget; 
            const mergeSourcesAverage = (mergeBodiesArr.length === 2) ? {
                position: lerpVec(mergeBodiesArr[0].position, mergeBodiesArr[1].position, 0.5),
                velocity: lerpVec(mergeBodiesArr[0].velocity, mergeBodiesArr[1].velocity, 0.5),
                angle: meanAngleFromTwo(mergeBodiesArr[0].angle, mergeBodiesArr[1].angle, 0.5),
            } : mergeBodiesArr[0];

            let addedSphere = undefined;
            let stageAfter = dest.stage;
            let addedScore = 0;
            
            if (mergesSinceLastDrop > 0) addedScore += 10;
            mergesSinceLastDrop++;

            if (mergeBodiesArr.length > 2) {
                console.log("this shouldn't happen, 4 bodies or more merging?")
                return;
            } else if (mergeBodiesArr.length === 2) {
                //console.log("triple merge!")
                addedScore += 40; // SPHERES_CONFIG[dest.stage].points * 2;
                stageAfter = dest.stage + 1;
            } else {
                //console.log("merge!");
                addedScore += 20; //SPHERES_CONFIG[dest.stage].points;
            }

            // fx
            if (mergeSound.paused) {
                mergeSound.play();
            } else {
                mergeSound2.play();
            }
            
            if (addedScore !== 0) {
                scoreSinceLastDrop += addedScore;
                document.getElementById('score-text').textContent = (score + scoreSinceLastDrop);
                if (scoreSinceLastDrop > highestCombo) {
                    highestCombo = scoreSinceLastDrop;
                    document.getElementById('combo-text').textContent = "MAX COMBO: " + (highestCombo);
                }
            }

            // add, only if not biggest stage of circles
            if (stageAfter < SPHERES_CONFIG[SPHERES_CONFIG.length-1].stage) {
                const newPosition = lerpVec(dest.position, mergeSourcesAverage.position, MERGE_LERP_BIAS);
                const newVelocity = lerpVec(dest.velocity, mergeSourcesAverage.velocity, MERGE_LERP_BIAS);

                addedSphere = createNewSphere(newPosition, SPHERES_CONFIG[stageAfter], false);
                addedSphere.dropID = -1;
                Body.setAngle(addedSphere, meanAngleFromTwo(dest.angle, mergeSourcesAverage.angle));
                Body.setVelocity(addedSphere, newVelocity);
            } 

            plannedMergesAtDestination.delete(mergeTarget);
            recentMerges.push(
                {tick: currentTick, 
                    addedScore, 
                    position: addedSphere.position,
                    circleRadius: addedSphere.circleRadius,
                    wasTripleMerge: (mergeBodiesArr.length > 1)
                });

            // remove constraints and bodies first
            const constraintsToRemove = compWorld.constraints.filter((c) => {
                return (c.bodyA === dest || c.bodyB === dest);
            });
            constraintsToRemove.forEach((constraint) => {
                //console.log("constraint:", constraint);
                Composite.remove(compWorld, constraint);
            });
            mergeBodiesArr.forEach((sourceBody) => {
                // for each body that was approaching the target body, remove the constraint and the body
                Composite.remove(compWorld, sourceBody);
            });
            // also remove the target itself
            Composite.remove(compWorld, dest);
            // add new sphere
            if (addedSphere !== undefined) {
                Composite.add(compWorld, addedSphere);
            }
        }
    });
}

function updateStackState() {
    const drop_until = DROP_HEIGHT - DROP_BARRIER;

    // rest follow if lowest one has been dropped, with a bit of a delay
    if (tickWhereLastSphereDropped !== null) { 
        if (currentTick - tickWhereLastSphereDropped >= TICKS_UNTIL_SPHERES_FOLLOW) {
            const stackLowerEdge = compDrops.bodies[0].bounds.max.y;
            if (stackLowerEdge < drop_until) {
                Composite.translate(compDrops, {x: 0, y: 5});
            } else {
                if (stackLowerEdge !== drop_until) Composite.translate(compDrops, {x: 0, y: drop_until - stackLowerEdge});
                tickWhereLastSphereDropped = null;
            }
        }
    }

    // drop lowest
    if (dropScheduled && compDrops.bodies[0].bounds.max.y >= drop_until - 0.5) {
        dropSphereFromStack();
        if (compDrops.bodies.length > 0) tickWhereLastSphereDropped = currentTick;
    }

    if (!lostGame) dropScheduled = false;
}

function dropSphereFromStack() {
    if (compDrops.bodies.length === 0) return;
    mergesSinceLastDrop = 0;
    score += scoreSinceLastDrop;
    scoreSinceLastDrop = 0;

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

function createNewSphere(pos, pickedProperties, isStatic) {
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

    const addedSphere = createNewSphere(pos, pickedProperties, true);
    Body.setAngle(addedSphere, Common.shuffle([-0.02, 0.02, -0.04, 0.04])[0]*Math.PI);
    Composite.add(dest, addedSphere);
}

function moveStackX(newX) {
    const bounds = compDrops.bodies[0].circleRadius ?? 0;
    newX = Math.max(newX, bounds);
    newX = Math.min(newX, PLAY_AREA_WIDTH - bounds);

    stackX = newX;

    compDrops.bodies.forEach((body, index) => {
        // if (ticksCountdownUntilFollow === null) { // not in midair
        //     const dir = (index % 2 === 0) ? 1 : -1;
        //     const deltaPosX = stackX - body.position.x;
        //     const rotAngle = Math.PI * (deltaPosX / body.circleRadius) * 0.5 * dir;
        //     Body.setAngle(body, body.angle + rotAngle % (Math.PI * 2));
        // }

        Body.setPosition(body, {x: stackX, y: body.position.y});
        
    });
}

function easeOutExpo(x) {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
