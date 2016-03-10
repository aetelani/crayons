/* ex: set tabstop=4: */
"use strict";

var _ = require("lodash");
var position = require("../../position.js");

// Change botNames and teamName to your choice.
var botNames = [
  "McBot",
  "McOrNot",
  "McIdler"
];

module.exports = function Ai() {

  var enemySightings = [];
  var prevTargets = [];
  var workQueue = [];
  var allPositions = [];

  var prevRadarPts = [];
  var radarPoints = [];

  function getBot(id, bots)
  {
	for(var l1=0; l1<bots.length; l1++)
	if (bots[l1].botId == id)
		return bots[l1];

	return null;
  }

  function maxNeighbours(pos, radius, origo, fieldRadius) {
    var result = [];

    for (var x = pos.x - radius; x <= pos.x + radius; x++) {
        for (var y = pos.y - radius; y <= pos.y + radius; y++) {

            var newPos = position.make(x, y);
            
            if( position.distance(pos,newPos) !== radius ||
                position.distance(newPos, origo) > fieldRadius ||
                position.eq(pos, newPos)
            )
                continue;
                
            result.push(newPos);

        }
    }

    return result;
  }

  function calcRadar(mapSize, radarRad)
  {
        var safety = 4;
        do
        {
                var posOk = true,
				    ps = allPositions[randInt(0, allPositions.length - 1)];

                radarPoints.forEach(function(item){
                        var dist = position.distance(ps,item);
						if(dist<=3)
							posOk=false;
                });

                if(posOk && safety >= 3)
                {
						prevRadarPts.forEach(function(item){
							var dist = position.distance(ps,item);
							if(dist<=3)
								posOk=false;
						});
                }

                if(posOk)
                {
                        radarPoints.push(ps);
						return(ps);
                } 

                safety--;
        } while(safety > 0);
		return(ps);
  }

  function addJobToQueue(priority, job, botId,  bots, config) {
	var bot = botId != null ? getBot(botId, bots) : null;

	// Trying to add action to dead or non-existant bot ?
	if( ( bot && !bot.alive ) || ( bot == null && botId != null ) )
		return;

	// Add same action to all bots?
	if(botId == null)
	{
		_.each(bots, function(bot) {
			addJobToQueue(priority, job, bot.botId, bots, config);
		});
		return;
	}

	//
	switch( job.action )
	{
		case "init":
			workQueue[ botId ] = []

		case "init":
		case "radar":
			var pos = calcRadar(config.fieldRadius, config.radar);
			workQueue[ botId ].push({ priority: priority, action: "radar" , x: pos.x, y: pos.y });
			console.error("Adding job 'radar'("+pos.x+","+pos.y+") to bot: "+botId+" with prio: "+priority);
			break;

		case "flee":
			var ps = maxNeighbours(position.make(bot.x, bot.y), config.move, config.origo, config.fieldRadius);
			var pos = ps[randInt(0, ps.length - 1)];
			workQueue[ botId ].push({ priority: priority, action: "move" , x: pos.x, y: pos.y });

			console.error("Adding job 'move'("+pos.x+","+pos.y+") to bot: "+botId+" with prio: "+priority);
			break;

		case "attack":
			prevTargets[ botId ] = { x: job.pos.x, y: job.pos.y };
			workQueue[ botId ].push({ priority: priority, action: "cannon" , x: job.pos.x, y: job.pos.y });
			console.error("Adding job 'attack'("+job.pos.x+","+job.pos.y+") to bot: "+botId+" with prio: "+priority);
			break;
	}

	//
  }


  function makeDecisions(roundId, events, bots, config) {

	console.error("--- Round: "+roundId);

	/* -- Init bot work queues -- */
	workQueue = [];
    radarPoints = [];
    allPositions = position.neighbours(position.origo, config.fieldRadius-3);
	addJobToQueue(0, { action: "init" }, null, bots, config);

    /* -- Remove expired sightings -- */
    _.forEach(enemySightings, function(item,key) {
	if( (roundId - item.round) > 2 )
		enemySightings[key] = null;
    });
    enemySightings = _.compact(enemySightings);	

    /* -- Process events -- */
    _.each(events, function(event) {
	switch(event.event)
	{
		case "see":
		case "radarEcho":
			enemySightings.push( { round: roundId, pos: event.pos } )
			addJobToQueue(2, { action: "attack", pos: event.pos } , null, bots, config);
			break;
		case "hit":
			var bot = getBot(event.source, bots);
			var ps = position.neighbours(position.make(prevTargets[bot.botId].x, prevTargets[bot.botId].y), 1);
			var pos = ps[randInt(0, ps.length - 1)];

			addJobToQueue(3, { action: "attack", pos: pos } , null, bots, config);
			break;
		case "damaged":
			var bot = getBot(event.botId, bots);
			if(bot.hp<5)
				addJobToQueue(4, { action: "flee" }, event.botId, bots, config);
			else
				addJobToQueue(2, { action: "flee" }, event.botId, bots, config);
			break;

		case "noaction": 
		case "move":
			break;

		case "detected":
			addJobToQueue(2, { action: "flee" }, event.botId, bots, config);
			break;

		case "die":
			console.error("Bleh .. Bot "+event.botId+" died :(");
			break;

		default:
			console.error("Unhandled event: "+event.event, event.data);
			break;
	}
    });

    /* -- Tough decisions ahead -- */
    bots.forEach(function(bot) {
		if(!bot.alive)
			return;

		var works = workQueue[bot.botId].sort(function (a,b) {
			return b.priority - a.priority;
		});

		if(works.length == 0)
			return;

		console.error( "Bot "+bot.botId+" (x: "+bot.x+", y:"+bot.y+", hp:"+bot.hp+") doing task '"+works[0].action.toString()+"'" );
		var fn = bot[works[0].action];
		fn( works[0].x , works[0].y );
    });

	//
	prevRadarPts = radarPoints;

  }


  function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return {
    botNames: botNames,
    makeDecisions: makeDecisions
  };

};
