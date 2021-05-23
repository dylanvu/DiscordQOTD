import dotenv from 'dotenv'
import Axios from 'axios'
import Discord from "discord.js"
import cron from 'cron'
import Filter from 'bad-words'
import mongo from 'mongodb'

import express from 'express'

const APP = express();
const PORT = 3000;

dotenv.config();

APP.get('/', (req, res) => res.send('Hello World!'));
APP.listen(PORT, () => console.log(`Discord QOTD app listening at http://localhost:${PORT}`));

const client = new Discord.Client();
const BOT_TOKEN = process.env.TOKEN;

const filter = new Filter();
filter.addWords('Reddit', 'reddit', 'redditor', 'askreddit', 'karma', 'subreddit', 'repost', 'crosspost', 'sexual', 'flirt', 'flirting', "into you", 'date'); // Flter out some reddit-related words and other words

const mongoclient = new mongo.MongoClient(process.env.MONGO_DB_CONNECTION, { useUnifiedTopology: true, useNewUrlParser: true });

const GetMessageIDs = (msg) => {
    let channelid = msg.channel.id;
    let guildid = msg.channel.guild.id;
    return [channelid, guildid]
}

// Schedule a message using cron
// 0 0 9 * * * means 9:00 AM exactly
let testJob = new cron.CronJob('0 0 9 * * *', () => {
    console.log("Sending question to all channels");
    GetAndSendQuestion();
}, null, true, 'America/Los_Angeles');

testJob.start();

// <--------------------------------------- Question Sending Functions --------------------------------------->

async function GetAndSendQuestion() {

    try {
        // Connect to MongoDB Cluster
        await mongoclient.connect();
        await SendQuestion(mongoclient);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function SendQuestion(mongoclient) {
    const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json";
    // TODO: Error catching
    let post = await Axios.get(TOP_POST_API);
    let question;
    let profanity = true;
    let i = 0;
    // See if the top 25 posts are profane free, and get the first one
    while (profanity) {
        question = post.data.data.children[i].data.title;
        profanity = filter.isProfane(question);
        if (post.data.data.children[i].data.whitelist_status == "promo_adult_nsfw") {
            profanity = true;
        }
        //console.log(profanity);
        i++;
        if (i > 25) {
            break;
        }
    }
    // If, for some reason, the top 25 results ALL have profanity, try the top 100 posts
    if (profanity) {
        while (profanity || i > 100) {
            post = await Axios.get(TOP_POST_API + "?limit=100");
            question = post.data.data.children[i].data.title;
            profanity = filter.isProfane(question);
            if (post.data.data.children[i].data.whitelist_status == "promo_adult_nsfw") {
                profanity = true;
            }
            i++;
            if (i > 100) {
                break;
            }
        }
    }
    // If the top 100 posts ALL have profanity, throw a general error
    if (profanity) {
        question = "404 Question not found. Please make your own QOTD this time, sorry!";
    } else {
        question = "**QOTD: " + question +  "**";
    }

    // TODO: Randomize between non-profane questions? So people who commonly use Reddit will see a relatively new question?
    let channelCollection = await mongoclient.db().collection("ActiveChannels");
    let allCursor = await channelCollection.find();
    // Reset previous question for every channel to be the current top question
    channelCollection.update({}, { $set: {
        prev_question : [question]
    }});
    allCursor.forEach((thisChannel) => {
        client.channels.cache.get(thisChannel.channel_id).send(question);
    })
}

async function GetAndSendQuestionToChannel(channelid, guildid, msg) {

    try {
        // Connect to MongoDB Cluster
        await mongoclient.connect();
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
    let question;
    let profanity = true;
    let channelCollection = await mongoclient.db().collection("ActiveChannels");
    let i = 0;
    let someCursor = await channelCollection.findOne(
        {
            channel_id : channelid,
            guild_id : guildid
        }
    )
    if (someCursor) {
        // Create an array from the set to enable quicker checking of previous questions
        let prevQset = new Set(someCursor.prev_question);
        
        // See if the top 25 posts are profane free and not a previous one, and get the first one
        while (profanity || prevQset.has(question)) {
            question = post.data.data.children[i].data.title;
            profanity = filter.isProfane(question);
            if (post.data.data.children[i].data.whitelist_status == "promo_adult_nsfw") {
                profanity = true;
            }
            //console.log(profanity);
            i++;
            if (i > 25) {
                break;
            }
        }
        // If, for some reason, the top 25 results ALL have profanity, try the top 100 posts
        if (profanity) {
            while (profanity || prevQset.has(question)) {
                post = await Axios.get(TOP_POST_API + "?limit=100");
                question = post.data.data.children[i].data.title;
                profanity = filter.isProfane(question);
                if (post.data.data.children[i].data.whitelist_status == "promo_adult_nsfw") {
                    profanity = true;
                }
                i++;
                if (i > 100) {
                    break;
                }
            }
        }
        
        // If the top 100 posts ALL have profanity, throw a general error
        if (profanity) {
            question = "404 Question not found. Please make your own QOTD this time, sorry!";
        } else {
            prevQset.add(question);
            question = "**QOTD: " + question +  "**";
        }
        
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
    }
}

// <------------------------------------ MongoDB functions -------------------------------------------------->

async function AddChannelToDatabase(mongoclient, channelid, guildid, msg) {
    try {
        // Connect to MongoDB Cluster
        await mongoclient.connect();
        await AddChannelIfExists(mongoclient, channelid, guildid, msg);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function AddChannelIfExists(mongoclient, channelid, guildid, msg) {

    let channelCollection = await mongoclient.db().collection("ActiveChannels");

    // Check if the channel exists in the database
    let someCursor = await channelCollection.findOne(
        {
            channel_id : channelid,
            guild_id : guildid,
        }
    )
    if (!someCursor) {
        console.log("Adding new channel with id: " + channelid);
        msg.reply("QOTD has been added! Stay tuned for 9:00 AM PST, or try `!qotd_newq` for a question now!");
        channelCollection.insertOne({
            channel_id : channelid,
            guild_id : guildid,
            prev_question : []
        })
    } else {
        console.log(channelid + " already exists in database");
        msg.reply("QOTD has already been started. Please wait until 9:00 AM PST, or try `!qotd_newq`!");
    }
}

async function RemoveChannelFromDatabase(channelid, guildid, msg) {
    try {
        // Connect to MongoDB Cluster
        await mongoclient.connect();
        await RemoveChannelIfExists(mongoclient, channelid, guildid, msg);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }
}

async function RemoveChannelIfExists(mongoclient, channelid, guildid, msg) {

    let channelCollection = await mongoclient.db().collection("ActiveChannels");

    // Check if the channel exists in the database
    let someCursor = await channelCollection.findOne(
        {
            channel_id : channelid,
            guild_id : guildid
        }
    )
    if (someCursor) {
        console.log("Deleting channel " + channelid);
        msg.reply("Stopping QOTD in this channel... D:");
        channelCollection.deleteOne({
            channel_id : channelid,
            guild_id : guildid
        }, true)
    } else {
        console.log("Cannot delete channel that doesn't exist");
        msg.reply("It appears you haven't added QOTD to this channel yet. At least try me out before removing me... D:");
    }
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})


// <-------------------------------------- Discord.js Control the sending of messages --------------------------------------------->
client.on("message", msg => {
    // Starting the Bot
    if (msg.content === "!qotd_start") {
        // Add the channel to the mongodb database
        let [channelid, guildid] = GetMessageIDs(msg);
        AddChannelToDatabase(mongoclient, channelid, guildid, msg);
    }
    
    // Remove scheduled QOTD from current channel
    if (msg.content ==="!qotd_stop") {
        let [channelid, guildid] = GetMessageIDs(msg);
        RemoveChannelFromDatabase(channelid, guildid, msg);
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
        msg.reply("To start daily QOTD, do `!qotd_start` \nTo stop daily QOTD, do `!qotd_stop` \nTo view the code, do `!qotd_github`");
    }

    
    // Joke Test
    if (msg.content === "!qotd_testing"){
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
// TODO: Fix the warnings, like [MONGODB DRIVER] Warning: the options [servers] is not supported
// TODO: Handle deleted channels? When you're sending, check if the channel is deleted. If it is, remove it from the database
// TODO: Make async functions nicer somehow
// TODO: Create functions for repeated code
// TODO: Set user permissions to use bot?