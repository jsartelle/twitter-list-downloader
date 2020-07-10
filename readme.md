# Requirements
- Node.js 14+ (due to use of [optional chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) and [nullish coalescing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator))

# Setup

- Run `npm install` to install dependencies.
- Run the app using `node index.js` to create a config file, located at `config/config.json`.
- Register as a Twitter developer at <https://developer.twitter.com/> and create a new app. Under "Keys and tokens", generate an access token & secret. Fill in the `auth` section in the config file with the values for your app.
- Under `lists`, replace "List ID" with the numeric ID of your list. You can copy this from the URL when viewing your list on the Twitter website. You can add more lists by adding more entries to the `lists` object.
- Run the app again, and it will save as many media from each list as it can (limited by the Twitter API). On each subsequent run, only media posted since the previous run will be saved.
    - You can reset this by deleting the "latestTweetId" property for each list in `config/listInfo.json`. You can change the folder name each list outputs to by changing the `name` property (for example, if you rename a list).

# List Options

Default values are shown.

```js
"List ID": {
    // Also save retweeted media
    "retweets": false,
    // Save these types of media (animated GIFs are saved as mp4)
    "mediaTypes": {
        "photo": true,
        "video": true,
        "animated_gif": true
    },
    "exclude": {
        // Ignore tweets from or retweeted by these usernames
        "users": [],
        // Ignore tweets containing these keywords
        "keywords": []
    },
    // For debugging: save empty files instead of media
    "dryRun": false,
    // For debugging: ignore latestTweetId and always fetch as many tweets as possible
    "ignoreLatestTweetId": false
}