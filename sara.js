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
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID,
                              process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. \
                  If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


//var springboard = require('./springboard')


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

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}


var RestClient = require('node-rest-client').Client;
var restClient = new RestClient();
restClient.registerMethod("jsonMethod", "https://app.knowledgeowl.com/api/head/suggest.json", "GET");
const baseURL = "https://help.springboard.com/help/article/link/"

controller.hears(['owl (.*)'],'direct_message',function(bot, message) {
  searchKnowledgeOwl(bot.replyWithTyping,message);
});

var searchKnowledgeOwl = function(botFunc,message){
  var args = {
    parameters: {
      project_id: process.env.KNOWL_KB_ID,
      _authbykey: process.env.KNOWL_KEY,
      phrase: message.text
    }
  };
  restClient.methods.jsonMethod(args, function (response) {
      console.log(response);
      if (response.valid && response.data.length){
        attach = [];
        for (i=0; i < response.data.length;i++) {
            res = response.data[i];
            console.log(res);
            attach.push({
                title: res.name,
                title_link: baseURL + res.url_hash
            });
        };
        responseMessage = {
          text: "Here are a few results that might help:",
          attachments: attach
        };
      } else {
        responseMessage = {
          text: "No results! Try another query, perhaps?",
        };
      }
      console.log(responseMessage);
      botFunc(message,responseMessage);
  });
}


controller.on('slash_command', function (slashCommand, message) {
    switch (message.command) {
        case "/owl":
            // but first, let's make sure the token matches!
            if (message.token !== process.env.SLASH_TOKEN) return; //just ignore it.

            // if no text was supplied, treat it as a help command
            if (message.text === "" || message.text === "help") {
                slashCommand.replyPrivate(message,
                    "Usage: /owl [query]");
                return;
            }

            responseMessage = searchKnowledgeOwl(slashCommand.replyPrivate,message);
            break;
        default:
            slashCommand.replyPrivate(message, "I'm afraid I don't know how to " + message.command + " yet.");
    }
  }
);

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
