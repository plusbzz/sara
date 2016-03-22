/**
 * A Bot for Slack!
 */

/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say("Hi there, I'm Taylor. I'm a bot that has just joined your team.");
                convo.say('You can now /invite me to a channel so that I can be of use!');
            }
        });
    }
}

// Create a fake http server to bind port
var PORT = (process.env.PORT || 5000)
var http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Server is running\n');
}).listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});

/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_taylor_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. \
                  If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

controller.on('bot_channel_join', function (bot, message) {
    bot.replyWithDelay(message, "I'm here!")
});


controller.hears(['hello','hi'],'direct_message,direct_mention,mention',function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    },function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(',err);
        }
    });


    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.name) {
            bot.replyWithDelay(message,'Hello ' + user.name + '!!');
        } else {
            bot.replyWithDelay(message,'Hello.');
        }
    });
});

controller.hears(['call me (.*)'],'direct_message,direct_mention,mention',function(bot, message) {
    var matches = message.text.match(/call me (.*)/i);
    var name = matches[1];
    controller.storage.users.get(message.user,function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user,function(err, id) {
            bot.replyWithDelay(message,'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name','who am i'],'direct_message,direct_mention,mention',function(bot, message) {

    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.name) {
            bot.replyWithDelay(message,'Your name is ' + user.name);
        } else {
            bot.replyWithDelay(message,'I don\'t know yet!');
        }
    });
});


controller.hears(['shutdown'],'direct_message,direct_mention,mention',function(bot, message) {

    bot.startConversation(message,function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?',[
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    },3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime','identify yourself',
                  'who are you','what is your name'],
                  'direct_message,direct_mention,mention',function(bot, message) {
    var uptime = formatUptime(process.uptime());
    bot.replyWithDelay(message,':robot_face: I am <@' + bot.identity.name + '>. I have been running for ' + uptime + '.');
});

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

/**
API.ai integration for default case.
*/

var apiai = require('apiai');
var apiai_app = apiai(
  process.env.APIAI_ACC, process.env.APIAI_SUB
);
var apiai = require('apiai');
var apiai_app = apiai(
  process.env.APIAI_ACC, process.env.APIAI_SUB
);

controller.hears(['.*'],['direct_message','direct_mention','mention', 'ambient'],
  function(bot,message) {
    console.log(message.text);
    if (message.type == "message") {
        if (message.user == bot.identity.id) {
            // message from bot can be skipped
        }
        else {
            var requestText = message.text;
            var request = apiai_app.textRequest(requestText);
            request.on('response', function (response) {
                if (response.result) {
                    var responseText = response.result.fulfillment.speech;
                    console.log(responseText);
                    bot.replyWithDelay(message, responseText||"Sorry, I can't answer that right now :(" );
                }
            });
            request.on('error', function(error) {
              controller.storage.users.get(message.user,function(err, user) {
                  if (user && user.name) {
                      bot.replyWithDelay(message,'Sorry, I don\'t understand that yet ' + user.name +'.');
                  } else {
                      bot.replyWithDelay(message,"Sorry, I can't answer that right now :(");
                  }
              });
            });
            request.end();
        }
    }
  }
);
