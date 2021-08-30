# Discord Question of the Day (QOTD) Bot
## About
This bot pulls the top daily question from r/AskReddit at 9:00 AM PST, makes sure there is no profanity, then sends it to your Discord Server!
It's perfect for some community engagement by prompting some discussion.
## Adding the Bot to Your Server and Channel
1. Copy and paste this link into your browser: https://discord.com/api/oauth2/authorize?client_id=844084506615873556&permissions=3072&scope=bot
2. Log into Discord and add the bot to your server. **Make sure you have admin privileges**.
3. Go into your text channel that you want the question to be sent in and type in `!qotd_start`.
4. Wait for a confirmation reply. If there's no reply, try `!qotd_start` in a few minutes.
## Removing the Bot
1. Type in `!qotd_stop` in the text channel that QOTDs are being sent.
2. Wait for a confirmation reply. If there's no reply, try `!qotd_stop` in a few minutes.
3. After removing the bot from all of the channels, kick the bot out of your server.
## Bot Commands
* `!qotd_help` for a list of commands
* `!qotd_start` to start daily questions in your channel
* `!qotd_stop` to stop daily questions in your channel
* `!qotd_today` to view the current QOTD in your channel
* `!qotd_github` to view this respository

## Removed Commands
* `!npm start` to start daily Programming questions in your channel
* `!ctrl c` to stop daily Programming questions in your channel

## Technologies Used
* [Node.JS](https://nodejs.org/en/) - Java Runtime Environment, the main "language" (technically JavaScript)
* [DiscordJS](https://discord.js.org/#/) - module for interacting with Discord
* [bad-words](https://www.npmjs.com/package/bad-words) - filtering profanity
* [Axios](https://www.npmjs.com/package/axios) - getting questions from Reddit
* [MongoDB](https://www.mongodb.com/) - storing channel ids to send the QOTD messages to
* [cron](https://www.npmjs.com/package/cron) - to schedule QOTD messages

## Issues
* Due to the method of hosting this Discord Bot, there are random (but short) outages. If well timed enough to overlap with 9:00 AM PST, a question will NOT be sent that day without any notification. There's no way around this issue except for a dedicated paid hosting service.
