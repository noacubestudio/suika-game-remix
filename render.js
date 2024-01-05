function renderSceneToCanvas(ctx) {

    ctx.fillStyle = '#444444';
    ctx.fillRect(0, 0, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT + DROP_HEIGHT);
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

    // 

    // line to indicate where you next drop
    if (!lostGame && compDrops.bodies[0].bounds.max.y >= DROP_HEIGHT-DROP_BARRIER - 0.5) { 
        let gradient = ctx.createLinearGradient(0, DROP_HEIGHT, 0, PLAY_AREA_HEIGHT);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.05');//'#f78d8d10');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1');//'#f78d8d20');
        ctx.fillStyle = gradient;
        const dropRadius = compDrops.bodies[0].circleRadius ?? 14;
        ctx.fillRect(stackX -dropRadius, DROP_HEIGHT, dropRadius * 2, PLAY_AREA_HEIGHT);
    }

    // indicate dropping platform and rising losing gradient
    if (!lostGame) {
        if (visualDistanceFromLosingPercent < 1) {
            const intensity = 1 - visualDistanceFromLosingPercent;
            const blinkRed = Math.sin(currentTick / 4)/2 + 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${blinkRed * intensity})`;;
            // ctx.fillRect(0, DROP_HEIGHT-DROP_BARRIER, PLAY_AREA_WIDTH, DROP_BARRIER);
            ctx.fillRect(0, DROP_HEIGHT*(1-intensity), PLAY_AREA_WIDTH, DROP_HEIGHT*(intensity));
        }
        
        // ctx.fillStyle = `rgba(255, 255, 255, ${0.1})`;;
        // ctx.fillRect(0, DROP_HEIGHT-4, PLAY_AREA_WIDTH, 4);

        if (compDrops.bodies[0].bounds.max.y >= DROP_HEIGHT-DROP_BARRIER - 0.5) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2' //'#f78d8d';
            const dropRadius = compDrops.bodies[0].circleRadius ?? PLAY_AREA_WIDTH;
            const dropPos = compDrops.bodies[0].position.x - dropRadius ?? 0;
            ctx.fillRect(dropPos, DROP_HEIGHT-DROP_BARRIER, dropRadius*2, 10);
            ctx.fillStyle = 'black';
            ctx.fillRect(dropPos-10, DROP_HEIGHT-DROP_BARRIER, dropRadius*2+20, 4);
        }
    }

    // foreground
    ctx.fillStyle = 'black';//"#20082EA0";
    compDrops.bodies.forEach((body) => { renderSphereShadow(ctx, body); });
    compWorld.bodies.forEach((body) => { renderSphereShadow(ctx, body); });

    compDrops.bodies.forEach((body, index) => { renderSphereBody(ctx, body, index); });
    compWorld.bodies.forEach((body) => { renderSphereBody(ctx, body); });

    ctx.lineWidth = 4;
    recentMergesInfoArr.forEach((mergeObject) => renderMergeEffect(ctx, mergeObject));

    // in front of everything
    let gradient = ctx.createLinearGradient(0, 2, 0, DROP_HEIGHT-DROP_BARRIER);
    gradient.addColorStop(0, '#180d2fE0');
    gradient.addColorStop(1, '#180d2f00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -2, PLAY_AREA_WIDTH, DROP_HEIGHT-DROP_BARRIER);
}


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

    // non-rotated shading

    const gradient = ctx.createRadialGradient(p.x - 0.35*r, p.y - 0.35*r, r*0.4, p.x, p.y, r);
    gradient.addColorStop(0, "#ffffff20");
    gradient.addColorStop(1, "#3D083B20");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fill();

    const gradient2 = ctx.createRadialGradient(p.x - 0.1*r, p.y - 0.1*r, r*0.5, p.x, p.y, r);
    gradient2.addColorStop(0, "#f78d8d00");
    gradient2.addColorStop(1, "#f78d8d10");
    ctx.fillStyle = gradient2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fill();
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
