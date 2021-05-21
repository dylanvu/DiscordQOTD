import Axios from 'axios'
import Discord from "discord.js"
import cron from 'cron'

import dotenv from 'dotenv'

const client = new Discord.Client();
dotenv.config();

const BOT_TOKEN = process.env.TOKEN;

const GetMessageIDs = (msg) => {
    let channelid = msg.channel.id;
    let guildid = msg.channel.guild.id;
    return [channelid, guildid]
}


async function GetAndSendQuestion() {
    const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json"
    let post = await Axios.get(TOP_POST_API);
    let question = "**QOTD: " + post.data.data.children[0].data.title + "**";
    for (let [currentChannelid, currentGuildid] of channelIdlist) {
        client.channels.cache.get(currentChannelid).send(question);
    }
}

// idList will hold every channel-guild id key-value pair
let channelIdlist = new Map();

// Schedule a message
// 0 0 9 * * * means 9:00 AM exactly
let testJob = new cron.CronJob('0 0 9 * * *', () => {
    console.log("Sending QOTD");
    GetAndSendQuestion();
}, null, true, 'America/Los_Angeles');

testJob.start();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

// Control the sending of messages
client.on("message", msg => {
    // Starting the Bot
    if (msg.content === "!qotd_start") {
        msg.reply("Starting QOTD!");
        let [channelid, guildid] = GetMessageIDs(msg);
        channelIdlist.set(channelid, guildid);
    }

    if (msg.content === "!qotd_test"){
        // Remove later since this command sends to every channel on the list
        GetAndSendQuestion();
    }
    
    // Remove scheduled QOTD from current channel
    if (msg.content ==="!qotd_stop") {
        msg.reply("Stopping QOTD in this channel... D:");
        // Remove the channel id from the array of ids
        channelIdlist.delete(msg.channel.id);
    }

    // Instantly Generating another question
    if (msg.content === "!qotd_newq") {
        msg.reply("Getting new QOTD!");
        console.log("New Question here") // TODO: Trigger API call here to get the next top post?
    }
})

client.login(BOT_TOKEN);