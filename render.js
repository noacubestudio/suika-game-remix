function renderSceneToCanvas(ctx) {

    ctx.fillStyle = '#444444';
    ctx.fillRect(0, 0, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT + ABOVE_PLAY_AREA_HEIGHT);
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.lineCap = "round";

    const distanceFromLosingPercent = (tickWhereTopLastReached !== null)
        ? 1 - ((currentTick - tickWhereTopLastReached) / TICKS_UNTIL_LOST)
        : 1;
    const visualDistanceFromLosingPercent = (distanceFromLosingPercent < 0.7)
        ? distanceFromLosingPercent
        : 1;

    // background
    ctx.drawImage(ctxSprites.bg, 0, 0);
    if (lostGame) {
        ctx.globalAlpha = 0;
    } else if (visualDistanceFromLosingPercent < 1) {
        ctx.globalAlpha = visualDistanceFromLosingPercent;
    }
    ctx.drawImage(ctxSprites.bgUpper, 0, 0);
    ctx.globalAlpha = 1;

    if (!lostGame) {

        // line to indicate where you next drop
        
        // ghost piece to indicate next drop
        // wait before showing this after a drop
        // it needs to be calculated, but also wont be shown, on top of a falling sphere.
        if (!tickWhereLastSphereDropped || currentTick - tickWhereLastSphereDropped > 20) {
            renderGhostPiece(ctx, compDrops.bodies[0].circleRadius ?? 14, stackX, compWorld.bodies);
        } 

        // rising blinking bg in danger area while losing
        if (visualDistanceFromLosingPercent < 1) {
            const intensity = 1 - visualDistanceFromLosingPercent;
            const blinkMultiplier = Math.sin(currentTick / 4)/2 + 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${blinkMultiplier * intensity})`;
            // ctx.fillRect(0, DROP_HEIGHT-DROP_BARRIER, PLAY_AREA_WIDTH, DROP_BARRIER);
            ctx.fillRect(0, ABOVE_PLAY_AREA_HEIGHT*(1-intensity), PLAY_AREA_WIDTH, ABOVE_PLAY_AREA_HEIGHT*(intensity));
        }
        
        // dropping platform
        const dropRadius = compDrops.bodies[0].circleRadius ?? PLAY_AREA_WIDTH;
        const dropPos = stackX - dropRadius ?? 0;
        const nextDropAboveRestingHeightDelta = DROP_FLOOR_HEIGHT - compDrops.bodies[0].bounds.max.y;
        const platformOpacity = 1 - Math.min(1, nextDropAboveRestingHeightDelta / 20) * 0.8;
        ctx.fillStyle = `rgba(0, 0, 0, ${platformOpacity})`;
        ctx.fillRect(dropPos-10, DROP_FLOOR_HEIGHT, dropRadius*2+20, 4);
        
    }

    // foreground
    // circles
    ctx.fillStyle = 'black';//"#20082EA0";
    compDrops.bodies.forEach((body) => { renderSphereShadow(ctx, body); });
    compWorld.bodies.forEach((body) => { renderSphereShadow(ctx, body); });

    compDrops.bodies.forEach((body, index) => { renderSphereBody(ctx, body, index); });
    compWorld.bodies.forEach((body) => { renderSphereBody(ctx, body); });

    // //glass
    // ctx.lineWidth = 4;
    // ctx.strokeStyle = `rgba(0, 0, 0, ${0.6})`;
    // ctx.beginPath();
    // ctx.roundRect(12, DANGER_AREA_HEIGHT+12, PLAY_AREA_WIDTH-24, PLAY_AREA_HEIGHT-24, 2);
    // ctx.stroke();

    // particles
    ctx.lineWidth = 4;
    recentMergesInfoArr.forEach((mergeObject) => renderMergeEffect(ctx, mergeObject));

    // in front of everything
    let gradient = ctx.createLinearGradient(0, 2, 0, DROP_FLOOR_HEIGHT);
    gradient.addColorStop(0, '#180d2fE0');
    gradient.addColorStop(1, '#180d2f00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -2, PLAY_AREA_WIDTH, DROP_FLOOR_HEIGHT);
}

function renderGhostPiece(ctx, radius, dropX, checkBodiesArr) {

    let closestCollisionY = ABOVE_PLAY_AREA_HEIGHT + PLAY_AREA_HEIGHT - radius;
    let closestCollisionBody = null;
    
    checkBodiesArr.forEach((body) => {
        const xDistance = Math.abs(dropX - body.position.x);
        const targetDistance = radius + body.circleRadius;

        // Check for potential collision
        if (xDistance < targetDistance) {
            const collisionY = body.position.y - Math.sqrt(targetDistance**2 - xDistance**2);

            // Update closest collision position if higher on the screen than the last
            if (collisionY < closestCollisionY) {
                closestCollisionY = collisionY;
                closestCollisionBody = body;
            }
        }
    });

    // Check if the colliding body has a significant downward velocity
    if (closestCollisionBody && closestCollisionBody.velocity.y > 3) {
        return; // don't render the ghost piece above the falling body
    }

    // if close to the top, fade out the preview since it is more distracting and not really needed then
    const visibility = Math.min(1, 6 * (closestCollisionY-ABOVE_PLAY_AREA_HEIGHT) / PLAY_AREA_HEIGHT);

    // linear gradient, more visible near the bottom
    const fadeInDownGradient = ctx.createLinearGradient(0, ABOVE_PLAY_AREA_HEIGHT, 0, closestCollisionY);
    fadeInDownGradient.addColorStop(0, `rgba(255, 255, 255, ${0.03 * visibility})`);
    fadeInDownGradient.addColorStop(1, `rgba(255, 255, 255, ${0.06 * visibility})`);

    ctx.fillStyle = fadeInDownGradient;
    ctx.strokeStyle = fadeInDownGradient;

    // semi circle and rectangle above
    ctx.beginPath();
    ctx.arc(dropX, closestCollisionY, radius, 0, Math.PI);
    ctx.fill();
    ctx.fillRect(dropX-radius, ABOVE_PLAY_AREA_HEIGHT, radius*2, closestCollisionY-ABOVE_PLAY_AREA_HEIGHT);

    // circle outline
    ctx.beginPath();
    ctx.arc(dropX, closestCollisionY, radius, 0, Math.PI*2);
    ctx.stroke();
}


function renderSphereShadow(ctx, body) {
    const r = body.circleRadius + 4;
    let p = { x: body.position.x, y: body.position.y};
    //p.x = Math.min(Math.max(body.circleRadius, p.x), PLAY_AREA_WIDTH-body.circleRadius);

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
    //p.x = Math.min(Math.max(body.circleRadius, p.x), PLAY_AREA_WIDTH-body.circleRadius);

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

    // non-rotated shading

    const gradient = ctx.createRadialGradient(p.x - 0.35*r, p.y - 0.35*r, r*0.4, p.x, p.y, r);
    gradient.addColorStop(0, "#3D083B00");
    gradient.addColorStop(1, "#3D083B20");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fill();

    const deltaXToStack = Math.min(Math.max(-PLAY_AREA_WIDTH, stackX-p.x), PLAY_AREA_WIDTH);
    const reflectXRange = -(deltaXToStack / PLAY_AREA_WIDTH) * 0.18;
    const reflectOpacity = 0.2 * Math.min(1, p.y / ABOVE_PLAY_AREA_HEIGHT);

    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = `rgba(255, 255, 255, ${reflectOpacity})`;
    ctx.beginPath();
    ctx.arc(p.x - reflectXRange*r, p.y - 0.16*r, r*0.7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${reflectOpacity})`;
    ctx.beginPath();
    ctx.arc(p.x - reflectXRange*r/2, p.y - 0.08*r, r*0.85, 0, 2 * Math.PI);
    ctx.fill();
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
