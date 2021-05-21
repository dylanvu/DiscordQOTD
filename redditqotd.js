//import GetAskReddit from "./askreddit.js"
import Axios from 'axios'
import Discord from "discord.js"
import cron from 'cron';

import dotenv from 'dotenv';

const client = new Discord.Client();
dotenv.config();

const BOT_TOKEN = process.env.TOKEN;

const GetMessageIDs = (msg) => {
    let channelid = msg.channel.id;
    let guildid = msg.channel.guild.id;
    return [channelid, guildid]
}

const TestQOTD = () => {
    console.log("Question requested...")

    async function GetAndSendQuestion() {
        const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json"
        let post = await Axios.get(TOP_POST_API);
        let question = "**QOTD: " + post.data.data.children[0].data.title + "**";
        for (let [currentChannelid, currentGuildid] of channelIdlist) {
            client.channels.cache.get(currentChannelid).send(question);
        }
    }
    GetAndSendQuestion();
}

// idList will hold every channel-guild id key-value pair
let channelIdlist = new Map();

// Schedule a message
let qotdJob = cron.CronJob('00 00 9 * * *', () => {
    console.log("Test Test");
});

//qotdJob.start();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

// Control the sending of messages
client.on("message", msg => {
    // Starting the Bot
    if (msg.content === "!start") {
        msg.reply("Starting QOTD!");
        let [channelid, guildid] = GetMessageIDs(msg);
        channelIdlist.set(channelid, guildid);
    }

    if (msg.content === "!test"){
        TestQOTD();
    }
    
    // Remove QOTD job from current channel
    if (msg.content ==="!qotd_stop") {
        msg.reply("Stopping QOTD... D:");
        // Remove the channel id from the array of ids
        channelIdlist.delete(msg.channel.id);
    }

    // Instantly Generating a question
    if (msg.content === "!qotd_newq") {
        msg.reply("Getting new QOTD!");
        console.log("New Question here") // TODO: Trigger API call here to get the next top post?
    }
})

client.login(BOT_TOKEN);

// TODO:
// When you receive a message to set up the job, feed in the channel ID from that message as a parameter?
// Experiment to see if the ID is saved between jobs or something like that?