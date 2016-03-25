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
                convo.say("Hi there, I'm Sara from Springboard.");
            }
        });
    }
}

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
        json_file_store: ((process.env.TOKEN)?'./db_sara_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}


if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var springboard = require('./springboard')
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID,
                              process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. \
                  If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}



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
    bot.reply(message, "I'm here!")
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
            bot.reply(message,'Hello ' + user.name + '!!');
        } else {
            bot.reply(message,'Hello.');
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
            bot.reply(message,'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name','who am i'],'direct_message,direct_mention,mention',function(bot, message) {

    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.name) {
            bot.reply(message,'Your name is ' + user.name);
        } else {
            bot.reply(message,'I don\'t know yet!');
        }
    });
});


controller.hears(['shutdown'],'direct_message,direct_mention,mention',function(bot, message) {

    bot.startConversation(message,function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?',
          [
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
        ]
      );
    });
});

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}
/**
API.ai integration for default case.
*/
const uuid = require('node-uuid');

const sessionIds = new Map();
const apiai = require('apiai');
var apiai_app = apiai(
  process.env.APIAI_ACC, process.env.APIAI_SUB
);

controller.hears(['.*'],['direct_message','direct_mention'],
  function(bot,message) {
    if (message.type == "message") {
        if (message.user == bot.identity.id) {
            // message from bot can be skipped
        } else if (message.text.indexOf("<@U") == 0 && message.text.indexOf(bot.identity.id) == -1) {
            // skip other users direct mentions
        } else {
            var requestText = message.text;

            var channel = message.channel;
            var messageType = message.event;
            var botId = '<@' + bot.identity.id + '>';
            console.log(requestText);
            console.log(messageType);
            if (requestText.indexOf(botId) > -1) {
                requestText = requestText.replace(botId, '');
            }
            if (!sessionIds.has(channel)) {
                sessionIds.set(channel, uuid.v1());
            }

            var request = apiai_app.textRequest(requestText, {
                        sessionId: sessionIds.get(channel)
            });
            request.on('response', function (response) {
                if (response.result) {
                    var responseText = response.result.fulfillment.speech;
                    var action = response.result.action;
                    console.log("Response Text: " + responseText);
                    bot.replyWithTyping(message, responseText || "Sorry, I can't answer that right now :(" );
                }
            });
            request.on('error', function(error) {
              console.log(error);
              controller.storage.users.get(message.user,function(err, user) {
                  if (user && user.name) {
                      bot.reply(message,'Sorry, I don\'t understand that yet ' + user.name +'.');
                  } else {
                      bot.reply(message,"Sorry, I don't understand that right now :(");
                  }
              });
            });
            request.end();
        }
    }
  }
);
