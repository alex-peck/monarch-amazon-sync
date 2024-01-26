<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Monarch / Amazon Sync</h1>
</div>

## What is this?

A simple Chrome extension to sync Amazon purchases with [Monarch](https://monarchmoney.com) transactions. Transactions in Monarch that match the time and amount of an Amazon purchase will have a note created in Monarch with the Amazon item details.

This will allow easy categorization of Amazon purchases in Monarch without the need to go back and forth from Amazon to Monarch figure out what you bought.

## Features

- Automatically matches Amazon orders with Monarch transactions based on amounts and dates
- Populates Monarch transaction notes with a list of item names and per-item prices
- Handles refunds (adds the same item names to a refund transaction when a refund is made)
- Supports gift card transactions (will match to existing Monarch transactions, does not create new transactions)
- Performs a daily sync to pull new Amazon orders and match them to Monarch transactions (requires browser to be open)
- Supports backfilling past years of Amazon orders to existing Monarch transactions

## Installation

> [!WARNING]
> This should be considered a BETA and therefore I have made the decision to not release it to the Chrome store yet. I've tested it pretty well but it may cause untold harm to your Monarch transactions! I recommend downloading a copy of your Monarch transactions before using this!

1. Download the latest release zip (`chrome-monarch-amazon-sync.zip`) from the [releases page](https://github.com/alex-peck/monarch-amazon-sync/releases/latest)
2. Unzip the file
3. Open Chrome and navigate to `chrome://extensions`
4. Enable developer mode
5. Click "Load unpacked" and select the unzipped folder

## How to use

1. Once the extension is installed, it will check if you are logged in to your Amazon account. Make sure you are logged in!
2. Open Monarch in your browser. This will allow the extension to grab the necessary API key from the page. After that you shouldn't need to keep the page open.

### Daily sync
1. Turn on "Sync"
2. Every day, the extension will check for new Amazon purchases and sync them to Monarch.
3. Optionally, use "Force sync" to manually sync purchases.

### Backfill
1. Choose "Manual backfill"
2. Pick a year to backfill
3. Optionally run in "dry-run" mode to create a CSV of what changes will be made before actually making them.

## Known limitations
- The extension does not create new transactions. It only updates the notes of existing transactions.
- Occasionally Amazon will break up a single order of many items into separate credit card transactions.
In this case, it is not currently possible to tell which items belong to which transaction.
To handle this, this extension will always populate all items in an order on every Monarch transaction associated with that Amazon order.
- For the per-item amounts in each note, the amount is not including tax. There is not currently a way to get the amount of individual items including tax.

## Screenshots
<img width="319" alt="image" src="https://github.com/alex-peck/monarch-amazon-sync/assets/53013351/af77f2b8-d92f-42ff-bc37-c7cedaf22fe9">

## Contributions

This repo isn't currently setup very well for contributions. Feel free to submit a PR and if there is interest I may improve the tooling.

## Misc

Built off of [chrome-extension-boilerplate-react-vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
