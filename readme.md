# Setup

Run `npm install` to install dependencies.

Run the app once (`node index.js`) to create a config file, located at `config/config.json`.

Register as a Twitter developer at <https://developer.twitter.com/> and create a new app. Under "Keys and tokens", generate an access token & secret. In the config file, fill in the `auth` section with the values for your app.

Under `lists`, replace "List ID" with the numeric ID of your list. You can copy this from the URL when viewing your list on the Twitter website. Add as many lists as you like by adding more entries to the `lists` object.

Run the app again to save the media (as many as are allowed by the Twitter API) from each of your lists. On each subsequent run, only media posted since the previous run will be saved. You can reset this by deleting the "latestTweetId" property for each list in `config/listInfo.json`. You can change the folder name each list outputs to by changing the `name` property (for example, if you rename a list).

# List Options
| Key      | Type    | Description                                |
| -------- | ------- | ------------------------------------------ |
| dryRun   | Boolean | Save empty files instead of media          |
| retweets | Boolean | Also save retweeted media (to a subfolder) |