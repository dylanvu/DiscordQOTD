const Discord = require("discord.js");
const client = new Discord.Client();
const cron = require('cron');

const dotenv = require('dotenv');
dotenv.config();

const BOT_TOKEN = process.env.TOKEN;

const GetMessageIDs = (msg) => {
    let channelid = msg.channel.id;
    let guildid = msg.channel.guild.id;
    return [channelid, guildid]
}

const TestQOTD = () => {
    let question = "**QOTD: here**";

    for (let [currentChannelid, currentGuildid] of channelIdlist) {
        client.channels.cache.get(currentChannelid).send(question);
    }
}

// idList will hold every channel-guild id key-value pair
let channelIdlist = new Map();

// Schedule a message
let qotdJob = cron.CronJob('00 00 9 * * *', () => {
    let question = "**QOTD here**"; // TODO: Replace this with an API call using axios?

    // Iterate through every channel the bot is in
    for (let [currentChannelid, currentGuildid] of channelIdlist) {
        client.channels.cache.get(currentChannelid).send(question);
    }
});

//qotdJob.start();

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
        TestQOTD();
    }
    
    // Remove QOTD job from current channel
    if (msg.content ==="!qotd_stop") {
        msg.reply("Stopping QOTD... D:");
        // TODO: Fix this stopping if we are making the job outside or something idk
        // Remove the channel id from the array of ids
        channelIdlist.delete(msg.channel);
        // qotdJob.stop();
    }

    // Instantly Generating a question
    if (msg.content === "!qotd_newq") {
        msg.reply("Getting new QOTD!");
        console.log("New Question here") // TODO: Trigger API call here to get the next top post?
    }
})

client.login(BOT_TOKEN);

// TODO:
// 1. Send a message to a specific channel. Do I have to get the guild id, and then the channel id?
//    If so, then figure out a way to store the id??? However, we can get the list of all guilds and channels the bot is managing.
//    What if we saved each specific channel id in a JSON or something like that, a dictionary. And then, that can be used to hold the info?

// When you receive a message to set up the job, feed in the channel ID from that message as a parameter?
// Experiment to see if the ID is saved between jobs or something like that?