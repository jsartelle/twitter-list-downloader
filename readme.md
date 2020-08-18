# Requirements
- Node.js 14+ (due to use of [optional chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) and [nullish coalescing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator))

# Setup

- Run `npm install` to install dependencies.
- Run the app (`node index.js`) to create a config file at `config/config.json`.
- Register as a Twitter developer at <https://developer.twitter.com/> and create a new app. Under "Keys and tokens", generate an access token & secret. Fill in the `auth` section in the config file with these values.
- Fill in the `users` and/or `lists` sections of the config file following the example below. LIST_IDs are the numeric IDs displayed in the URL when viewing your list on twitter.com.
- Run the app (`node index.js`) to save media from each user or list. On each subsequent run, only media posted since the previous run will be saved. Media may be limited by the Twitter API.
    - You can reset this by deleting the "latestTweetId" property for each user or list in `config/metadata.json`. You can change the default folder name by changing the `name` property (for example, if you rename a list).

# Options

Default values are shown.

```js
"Username or List ID": {
    // Also save retweeted media
    "retweets": false,
    // Log retweets to a text file (format: <retweeter> : <retweeted media name>)
    "logRetweets": false,
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
    "paths": {
        // Path to output folder
        "output": "./out/<user or list name>/",
        // Path to output folder for retweeted media (defaults to <output folder>/retweets/)
        "retweets": "./out/<user or list name>/retweets/"
    },
    // For debugging: save empty files instead of media
    "dryRun": false,
    // For debugging: ignore latestTweetId and always fetch as many tweets as possible
    "ignoreLatestTweetId": false
}