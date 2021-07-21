import dotenv from 'dotenv'
import Axios from 'axios'
import Discord from "discord.js"
import cron from 'cron'
import Filter from 'bad-words'
import mongo from 'mongodb'
import express from 'express'
import JSON_FILTER from "./filteredwords.json"
import fetch from 'node-fetch'
// Note: start with a `--experimental-json-modules`

import GetNonProfaneQuestion from './GetNonProfaneQuestion.js'

dotenv.config();

const APP = express();
const PORT = 3000;

APP.get('/', (req, res) => res.send('Hello World!'));
APP.listen(PORT, () => console.log(`Discord QOTD app listening at http://localhost:${PORT}`));

const client = new Discord.Client();
const BOT_TOKEN = process.env.TOKEN;

const filter = new Filter();
filter.addWords(...JSON_FILTER.words); // Filter out words from the JSON file

const mongoclient = new mongo.MongoClient(process.env.MONGO_DB_CONNECTION, { useUnifiedTopology: true, useNewUrlParser: true });

// Connect to MongoDB, you only have to do this once at the beginning
const MongoConnect = async () => {
    try {
        await mongoclient.connect()
    } catch (e) {
        console.error(e);
    }
}

MongoConnect();

const GetMessageIDs = (msg) => {
    let channelid = msg.channel.id;
    let guildid = msg.channel.guild.id;
    return [channelid, guildid]
}

// Schedule daily qotd using cron
// 0 0 9 * * * means 9:00 AM exactly
let qotdJob = new cron.CronJob('0 0 9 * * *', () => {
    console.log("Sending question to all channels");
    try {
        GetAndSendQuestion();
    } catch (error) {
        client.channels.cache.get(process.env.DEBUG_CHANNEL_ID).send("Error in QOTD!");
        client.channels.cache.get(process.env.DEBUG_CHANNEL_ID).send(error);
    }
    
    try {
        GetAndSendCSQuestion();
    } catch (error) {
        client.channels.cache.get(process.env.DEBUG_CHANNEL_ID).send("Error in CS QOTD!");
        client.channels.cache.get(process.env.DEBUG_CHANNEL_ID).send(error);
    }
    
}, null, true, 'America/Los_Angeles');

qotdJob.start();

// <--------------------------------------- QOTD Question Sending Functions --------------------------------------->

async function IterateAndSendToAll(mongoclient, collectionName, question, questionTosave) {
    let channelCollection = await mongoclient.db().collection(collectionName);
    //console.log(channelCollection);
    let allCursor = await channelCollection.find();
    // TODO: Reset doesn't seem to work?
    // Reset previous question for every channel to be the current top question
    await channelCollection.updateMany({}, { $set: {
        prev_question : [questionTosave]
    }});
    let channelDeletion = [];
    await allCursor.forEach((thisChannel) => {
        //console.log(thisChannel);
        //console.log(thisChannel.channel_id);
        // TODO: Add channel deletion check here and removal from collection

        // There was a bug where a channel did not exist for some reason except it was in the database, and I couldn't find it at all
        // If DiscordJS can find the channel, send the question. Else, DiscordJS can't find a channel and delete it from the database
        if (client.channels.cache.get(thisChannel.channel_id)) {
            client.channels.cache.get(thisChannel.channel_id).send(question);
            //console.log("(Debug) Message sent to " + thisChannel.channel_id);
        } else {
            console.log(thisChannel.channel_id + " does not exist when sending daily question. Deleting from database.")
            channelDeletion.push(thisChannel.channel_id);
        }
    })
    // console.log(channelDeletion);

    // Delete all undefined channels
    if (channelDeletion.length != 0) {
        channelDeletion.forEach((channelid) => {
            channelCollection.deleteOne({
                channel_id : channelid
            }, true)
        })
    }


}

async function GetAndSendQuestion() {

    try {
        // Connect to MongoDB Cluster
        //await mongoclient.connect();
        await SendQuestionToAllChannels(mongoclient);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function SendQuestionToAllChannels(mongoclient) {
    const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json";
    // TODO: Error catching
    let post = await Axios.get(TOP_POST_API);
    let questionTosend;

    // See if the top 25 posts are profane free, and get the first one
    let prevQset = new Set();
    questionTosend = GetNonProfaneQuestion(post, prevQset, filter, 25)
    // If, for some reason, the top 25 results ALL have profanity, try the top 100 posts
    if (questionTosend.profanity) {
        post = await Axios.get(TOP_POST_API + "?limit=100");
        questionTosend = GetNonProfaneQuestion(post, prevQset, filter, 100);
    }
    let question;
    let questionTosave; // Temporary fix, since if you do !qotd_newq immediately after all channels are sent messages, mongodb saves **QOTD as well so you get a duplicate question.
    // If the top 100 posts ALL have profanity, throw a general error
    if (questionTosend.profanity) {
        question = "404 Question not found. Please make your own QOTD this time, sorry!";
        questionTosave = question;
    } else {
        questionTosave = questionTosend.question;
        question = "**QOTD: " + questionTosend.question +  "**";
    }

    // TODO: Randomize between non-profane questions? So people who commonly use Reddit will see a relatively new question?

    // Now, use MongoDB to get active channels and send
    IterateAndSendToAll(mongoclient, "ActiveChannels", question, questionTosave);
    // let channelCollection = await mongoclient.db().collection("ActiveChannels");
    // let allCursor = await channelCollection.find();

    // // Reset previous question for every channel to be the current top question
    // channelCollection.update({}, { $set: {
    //     prev_question : [questionTosave]
    // }});

    // allCursor.forEach((thisChannel) => {
    //     // TODO: Add channel deletion check here and removal from collection
    //     client.channels.cache.get(thisChannel.channel_id).send(question);
    // })
}

async function GetAndSendQuestionToChannel(channelid, guildid, msg) {

    try {
        // Connect to MongoDB Cluster
        //await mongoclient.connect();
        await SendQuestionToChannel(mongoclient, channelid, guildid, msg);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function SendQuestionToChannel(mongoclient, channelid, guildid, msg) {
    const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json";
    // TODO: Error catching
    let post = await Axios.get(TOP_POST_API);
    //let question;
    let questionTosend; // This is an object with attribute question and profanity
    let channelCollection = await mongoclient.db().collection("ActiveChannels");
    let someCursor = await channelCollection.findOne(
        {
            channel_id : channelid,
            guild_id : guildid
        }
    );
    if (someCursor) {
        // Create a set from the MongoDB array to enable quicker checking of previous questions
        let prevQset = new Set(someCursor.prev_question);
        
        // See if the top 25 posts are profane free and not a previous one, and get the first one
        questionTosend = GetNonProfaneQuestion(post, prevQset, filter, 25);
        // If, for some reason, the top 25 results ALL have profanity, try the top 100 posts
        if (questionTosend.profanity) {
            post = await Axios.get(TOP_POST_API + "?limit=100");
            questionTosend = GetNonProfaneQuestion(post, prevQset, filter, 100);
        }
        
        // If the top 100 posts ALL have profanity, throw a general error
        let question;
        if (questionTosend.profanity) {
            question = "404 Question not found. Please make your own QOTD this time, sorry!";
        } else {
            prevQset.add(questionTosend.question);
            question = "**QOTD: " + questionTosend.question +  "**";
        };
        
        console.log("Sending question to channel " + channelid);
        await channelCollection.updateOne({
            channel_id : channelid,
            guild_id : guildid
        }, { $set: {
            prev_question : Array.from(prevQset)
        }});
        client.channels.cache.get(channelid).send(question);
    } else {
        msg.reply("It appears you haven't added QOTD to this channel yet. Do `!qotd_start` **then** do `!qotd_newq`!")
    };
}

// <--------------------------------------- CS QOTD Sending Functions --------------------------------------->

async function GetAndSendCSQuestion() {
    try {
        // Connect to MongoDB Cluster
        //await mongoclient.connect();
        await SendDailyCS(mongoclient);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function ReadGmail(access_token) {
    const GMAIL_API_KEY = process.env.GMAIL_API_KEY;
    const USER_ID = process.env.GMAIL_USER_ID;
    const LABEL_ID = "Label_4014517504537073939"; // This label ID corresponds to the DCP label in the gmail
    const GMAIL_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/" + USER_ID + "/messages?labelIds=" + LABEL_ID + "&key=" + GMAIL_API_KEY;
    let gmail_list_request = {
        method: "GET",
        headers: {
            Authorization: "Bearer " + access_token
        }
    }

    fetch(GMAIL_LIST_URL, gmail_list_request).then(response => {
        return(response.json());
    }).then(messageList => {
        // First, get the most recent email id
        console.log("Newest message ID: " + messageList.messages[0].id)
        const MESSAGES_GET_URL = "https://gmail.googleapis.com/gmail/v1/users/" + USER_ID + "/messages/" + messageList.messages[0].id + "?&key=" + GMAIL_API_KEY;
        let specific_message_request = {
            method: "GET",
            headers: {
                Authorization: "Bearer " + access_token
            }
        }
        // Now, fetch the contents of the most recent email and decode it out of base64
        fetch(MESSAGES_GET_URL, specific_message_request).then(response => {
            return(response.json());
        }).then(message => {
            let email_contents = message.payload.parts[0].body.data;
            let bufferObj  = Buffer.from(email_contents, "base64")
            let decoded = bufferObj.toString("utf8");
            //console.log(decoded);
        })
        // TODO: using the ID, use user.messages.get to get the contents and decode it
        // Then, use mongodb to get the channel ids to send the contents to.
    })
}

async function SendDailyCS(mongoclient) {
    const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
    const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
    const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
    const REFRESH_URL = "https://www.googleapis.com/oauth2/v4/token";
    const post_body = `grant_type=refresh_token&client_id=${encodeURIComponent(GMAIL_CLIENT_ID)}&client_secret=${encodeURIComponent(GMAIL_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(GMAIL_REFRESH_TOKEN)}`;
    let refresh_request = {
        body: post_body,
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }

    // post to the refresh endpoint, parse the json response and use the access token to call
    fetch(REFRESH_URL, refresh_request).then(response => {
        return(response.json());
    }).then(response_json => {
        console.log("Access token obtained.");
        let access_token = response_json.access_token;

        const GMAIL_API_KEY = process.env.GMAIL_API_KEY;
        const USER_ID = process.env.GMAIL_USER_ID;
        const LABEL_ID = "Label_4014517504537073939"; // This label ID corresponds to the DCP label in the gmail
        const GMAIL_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/" + USER_ID + "/messages?labelIds=" + LABEL_ID + "&key=" + GMAIL_API_KEY;
        let gmail_list_request = {
            method: "GET",
            headers: {
                Authorization: "Bearer " + access_token
            }
        }

        fetch(GMAIL_LIST_URL, gmail_list_request).then(response => {
            return(response.json());
        }).then(messageList => {
            // First, get the most recent email id
            console.log("Newest message ID: " + messageList.messages[0].id)
            const MESSAGES_GET_URL = "https://gmail.googleapis.com/gmail/v1/users/" + USER_ID + "/messages/" + messageList.messages[0].id + "?&key=" + GMAIL_API_KEY;
            let specific_message_request = {
                method: "GET",
                headers: {
                    Authorization: "Bearer " + access_token
                }
            }
            // Now, fetch the contents of the most recent email and decode it out of base64
            fetch(MESSAGES_GET_URL, specific_message_request).then(response => {
                return(response.json());
            }).then(message => {
                let email_contents = message.payload.parts[0].body.data;
                let bufferObj  = Buffer.from(email_contents, "base64")
                let decodedQuestion = bufferObj.toString("utf8");
                let parsed_string = decodedQuestion.split("--------------------------------------------------------------------------------");
                //console.log(parsed_string[0])
                IterateAndSendToAll(mongoclient, "CSActiveChannels", parsed_string[0], parsed_string[0]);
                //console.log(decoded);
            })
            // TODO: using the ID, use user.messages.get to get the contents and decode it
            // Then, use mongodb to get the channel ids to send the contents to.
        })
        
    })

}

// <------------------------------------ MongoDB functions -------------------------------------------------->

async function AddChannelToDatabase(mongoclient, channelid, guildid, msg, collectionName) {
    try {
        // Connect to MongoDB Cluster
        //await mongoclient.connect();
        await AddChannelIfExists(mongoclient, channelid, guildid, msg, collectionName);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    };
}

async function AddChannelIfExists(mongoclient, channelid, guildid, msg, collectionName) {
    // Valid collections names: ActiveChannels (standard QOTD) and CSActiveChannels (CS QOTD)
    let channelCollection = await mongoclient.db().collection(collectionName);

    // Check if the channel exists in the database
    let someCursor = await channelCollection.findOne(
        {
            channel_id : channelid,
            guild_id : guildid,
        }
    )
    if (!someCursor) {
        console.log("Adding new channel with id: " + channelid);
        if (collectionName == "ActiveChannels") {
            msg.reply("QOTD has been added! Stay tuned for 9:00 AM PST, or try `!qotd_newq` for a question now!");
        } else if (collectionName == "CSActiveChannels") {
            msg.reply("Daily Programming Question has been added! Stay tuned for 9:00 AM PST!")
        } else {
            console.log("No collection name of <" + collectionName + "> matched but new channel added");
        }

        channelCollection.insertOne({
            channel_id : channelid,
            guild_id : guildid,
            prev_question : []
        })
    } else {
        console.log(channelid + " already exists in database");
        if (collectionName == "ActiveChannels") {
            msg.reply("QOTD has already been started. Please wait until 9:00 AM PST, or try `!qotd_newq`!");
        } else if (collectionName == "CSActiveChannels") {
            msg.reply("Daily Programming Question has already been added! Please wait for 9:00 AM PST.");
        } else {
            console.log("No collection name of <" + collectionName + "> matches and current channel is already added");
        }
    }
}

async function RemoveChannelFromDatabase(channelid, guildid, msg, collectionName) {
    try {
        // Connect to MongoDB Cluster
        //await mongoclient.connect();
        await RemoveChannelIfExists(mongoclient, channelid, guildid, msg, collectionName);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function RemoveChannelIfExists(mongoclient, channelid, guildid, msg, collectionName) {
    // Valid collections names: ActiveChannels (standard QOTD) and CSActiveChannels (CS QOTD)
    let channelCollection = await mongoclient.db().collection(collectionName);

    // Check if the channel exists in the database
    let someCursor = await channelCollection.findOne(
        {
            channel_id : channelid,
            guild_id : guildid
        }
    )
    if (someCursor) {
        console.log("Deleting channel " + channelid);
        if (collectionName == "ActiveChannels") {
            msg.reply("Stopping QOTD in this channel... D:");
        } else if (collectionName == "CSActiveChannels") {
            msg.reply("Terminated Daily Programming Question from channel.")
        } else {
            console.log("Attempting to delete channel from <" + collectionName + "> but cannot find match to collection")
        }
        
        channelCollection.deleteOne({
            channel_id : channelid,
            guild_id : guildid
        }, true)
    } else {
        console.log("Cannot delete channel that doesn't exist");
        if (collectionName == "ActiveChannels") {
            msg.reply("It appears you haven't added QOTD to this channel yet. At least try me out before removing me... D:");
        } else if (collectionName == "CSActiveChannels") {
            msg.reply("Programming QOTD has not been added yet!");
        } else {
            console.log("Attempting to delete channel from <" + collectionName + "> when it doesn't exist in database, but cannot find match to collection")
        }
        
    }
}


// <-------------------------------------- Discord.js Control the sending of messages --------------------------------------------->
client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

client.on("message", msg => {
    // Starting the Bot
    if (msg.content === "!qotd_start") {
        // Add the channel to the mongodb database
        let [channelid, guildid] = GetMessageIDs(msg);
        AddChannelToDatabase(mongoclient, channelid, guildid, msg, "ActiveChannels");
    }

    if (msg.content === "!npm start") {
        // Add the channel to the mongodb database
        let [channelid, guildid] = GetMessageIDs(msg);
        AddChannelToDatabase(mongoclient, channelid, guildid, msg, "CSActiveChannels");
    }
    
    // Remove scheduled QOTD from current channel
    if (msg.content ==="!qotd_stop") {
        let [channelid, guildid] = GetMessageIDs(msg);
        RemoveChannelFromDatabase(channelid, guildid, msg, "ActiveChannels");
    }

    if (msg.content ==="!ctrl c") {
        let [channelid, guildid] = GetMessageIDs(msg);
        RemoveChannelFromDatabase(channelid, guildid, msg, "CSActiveChannels");
    }

    // if (msg.content ==="!cstest") {
    //     GetAndSendCSQuestion();
    // }

    if (msg.content === "!debug") {
        GetAndSendQuestion();
    }

    // Instantly Generating another question
    if (msg.content === "!qotd_newq") {
        let [channelid, guildid] = GetMessageIDs(msg);
        GetAndSendQuestionToChannel(channelid, guildid, msg);
    }

    if (msg.content === "!qotd_github") {
        msg.reply("https://github.com/vu-dylan/DiscordQOTD");
    }
    if (msg.content === "!qotd_help") {
        msg.reply("To add QOTD, do `!qotd_start` \nTo remove QOTD, do `!qotd_stop` \nTo get a new question, do `!qotd_newq` \n To add Programming QOTD, do `!npm start` \n To remove Programming QOTD, do `!ctrl c` \n To view the bot's code, do `!qotd_github`");
    }

    // Joke Test
    if (msg.content === "!qotd_testing") {
        let [channelid, guildid] = GetMessageIDs(msg);
        client.channels.cache.get(channelid).send(process.env.FUNNY_ERROR);
        setTimeout(() => {
            client.channels.cache.get(channelid).send(process.env.FUNNY_RESPONSE);
            GetAndSendQuestionToChannel(channelid, guildid, msg);
        }, 10000);
        
    }
})

client.login(BOT_TOKEN);

// TODO: Randomly select from top posts?
// TODO: Integrate custom questions?
// TODO: Save questions to a database, incorporate a database mode?
// TODO: Handle deleted channels? When you're sending, check if the channel is deleted. If it is, remove it from the database
// TODO: Make async functions nicer somehow
// TODO: Create functions for repeated code
// TODO: Set user permissions to use bot?
// TODO: Toggle filter option
// TODO: Reset once week instead?
// TODO: Don't save the 404 question not found
// TODO: Error checking on channel collection parameter?
// TODO: Move functions into separate files