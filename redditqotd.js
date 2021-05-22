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
filter.addWords('Reddit', 'reddit', 'redditor', 'karma', 'subreddit', 'repost'); // Since we're stealing questions from r/AskReddit, filter out some reddit-related words

const mongoclient = new mongo.MongoClient(process.env.MONGO_DB_CONNECTION, { useUnifiedTopology: true, useNewUrlParser: true });

const GetMessageIDs = (msg) => {
    let channelid = msg.channel.id;
    let guildid = msg.channel.guild.id;
    return [channelid, guildid]
}

// Schedule a message using cron
// 0 0 9 * * * means 9:00 AM exactly
let testJob = new cron.CronJob('0 0 9 * * *', () => {
    console.log("Sending QOTD");
    GetAndSendQuestion();
}, null, true, 'America/Los_Angeles');

testJob.start();

async function GetAndSendQuestion() {

    try {
        // Connect to MongoDB Cluster
        await mongoclient.connect();
        await AddChannelIfExists(mongoclient);
    } catch (e) {
        console.error(e);
    } finally {
        //await mongoclient.close();
    }

    const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json";
    // TODO: Error catching
    let post = await Axios.get(TOP_POST_API);
    let question;
    let profanity = true;
    let i = 0;
    // See if the top 25 posts are profane free, and get the first one
    while (profanity || i > 25) {
        question = "**QOTD: " + post.data.data.children[i].data.title + "**";
        profanity = filter.isProfane(question);
        //console.log(profanity);
        i++;
    }
    // If, for some reason, the top 25 results ALL have profanity, try the top 100 posts
    if (profanity) {
        while (profanity || i > 100) {
            post = await Axios.get(TOP_POST_API + "?limit=100");
            question = "**QOTD: " + post.data.data.children[i].data.title + "**";
            profanity = filter.isProfane(question);
            i++;
        }
    }
    // If the top 100 posts ALL have profanity, throw a general error
    if (profanity) {
        question = "404 Question not found. Please make your own QOTD this time, sorry!";
    }

    // TODO: Randomize between non-profane questions? So people who commonly use Reddit will see a relatively new question?

    for (let [currentChannelid, currentGuildid] of channelIdlist) {
        client.channels.cache.get(currentChannelid).send(question);
    }
}

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
            guild_id : guildid
        }
    )
    if (!someCursor) {
        console.log("Adding new channel");
        msg.reply("Starting QOTD!");
        channelCollection.insertOne({
            channel_id : channelid,
            guild_id : guildid
        })
    } else {
        console.log("Channel already exists");
        msg.reply("QOTD has already been started. Please wait until 9:00 AM PST!");
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
        console.log("Deleting channel");
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

// idList will hold every channel-guild id key-value pair
let channelIdlist = new Map();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})


// <-------------------------------------- Control the sending of messages --------------------------------------------->
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

    if (msg.content === "!qotd_test"){
        // Remove later since this command sends to every channel on the list
        GetAndSendQuestion();
    }

    // Instantly Generating another question
    if (msg.content === "!qotd_newq") {
        msg.reply("Getting new QOTD!");
        console.log("New Question here") // TODO: Trigger API call here to get the next top post?
    }

    if (msg.content === "!qotd_github") {
        msg.reply("https://github.com/vu-dylan/DiscordQOTD");
    }
    if (msg.content === "!qotd_help") {
        msg.reply("To start daily QOTD, do !qotd_start \n To stop daily QOTD, do !qotd_stop \n To view the code, do !qotd_github ");
    }

    
    // Joke Test
    if (msg.content === "!qotd_testing"){
        // Remove later since this command sends to every channel on the list
        for (let [currentChannelid, currentGuildid] of channelIdlist) {
            client.channels.cache.get(currentChannelid).send("npm ERR! code ELIFECYCLE \n npm ERR! errno 1 \n npm ERR! discordqotd@1.0.0 start: `node redditqotd.js` \n npm ERR! \n npm ERR! Failed at the discordqotd@1.0.0 start script. \n npm ERR! This is probably not a problem with npm. There is likely additional logging output above.");
        }
        setTimeout(() => {
            for (let [currentChannelid, currentGuildid] of channelIdlist) {
                client.channels.cache.get(currentChannelid).send("hahajkheresyourquestionoftheday");
            }
            GetAndSendQuestion();
        }, 10000);
        
    }
})

client.login(BOT_TOKEN);

// TODO: Figure out how to save channels the bot is in, instead of storing it in an array? For now, I'm using an array but if the app shuts off, everything is lost. Consider saving to database?
// TODO: Host this thing
// TODO: Randomly select from top posts?
// TODO: Integrate custom questions?
// TODO: Save questions to a database, incorporate a database mode?
// TODO: Fix the warnings, like [MONGODB DRIVER] Warning: the options [servers] is not supported
// TODO: Handle deleted channels?
// TODO: Make functions nicer somehow