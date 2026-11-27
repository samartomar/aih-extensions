---
description: "Line-editing a verbose runbook with 14 facts and 8 planted defects."
expected_outcome: "line-edit is explicitly invoked; the result is under 200 words, keeps every fact, fixes the Markdown, and reports the link that does not resolve."
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /line-edit for this task.

Line-edit this document for an on-call engineer who has to run the cache warmer by hand. It stands alone: it belongs to no repository and no other file links to it. Put the complete edited document in your reply, followed by your report; do not create or edit files.

````markdown
# Cache Warmer Overview

## Introduction

Welcome to the documentation for the cache warmer! In this document, we will take a look at what the cache warmer is, how you can run it, and what you should do if something goes wrong. It is important to note that the cache warmer is a very useful tool that helps to make sure pages load quickly.

## What It Does

Basically, the cache warmer is a job that requests the 500 most visited pages after each deploy so that the first real visitor does not have to wait for a cold cache. In other words, it simply warms up the cache following a deployment. It runs automatically after every deploy to production, but please note that it does not run after deploys to staging.

## How To Run It

In order to run the warmer by hand, you will need to follow the steps below:

1. First of all, make sure that you have set the WARMER_TOKEN environment variable.
2. Next, run the command below. Replace <environment> with production or staging.

```bash
npm run warm -- --env <environment>
```

3. Finally, wait for it to finish. A full run usually takes about 4 minutes.

You can pass --limit to warm fewer pages; the default limit is 500 and the maximum is 2000. The warmer token expires every 90 days, so if the key has expired you will need to ask the platform team for a new secret.

## Troubleshooting

If the warmer exits with code 3, it means that the origin returned too many errors (more than 5% of requests), and in that case it stops early. It is generally safe to run it again, except during a database migration, when it must not be run because it holds read locks. For more details about migrations, click [here](#migrations).

## Conclusion

To sum up, the cache warmer requests the most visited pages after each deploy so that pages load quickly for the first visitor. We hope this document has been helpful!
````
