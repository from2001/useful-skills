Creates a new post (tweet, reply, or quote tweet), optionally with images. Maps to POST /2/tweets (and POST /2/media/upload when `--media` is used). Invoke via `node <base_directory>/x.js post "<text>" [flags]`. Output is JSON to stdout.

[!FLAGS] a) no flags — creates a standalone tweet with the given text. b) `--reply-to <id>` — makes this post a reply to the specified post ID. c) `--quote <id>` — makes this a quote tweet of the specified post ID. d) `--reply-settings <following|mentionedUsers|subscribers|verified>` — restrict who can reply. e) `--media <paths>` — comma-separated list of local media paths. A tweet may include EITHER up to 4 images (PNG/JPEG/WebP, ≤5 MB each) OR exactly 1 animated GIF (≤15 MB) OR exactly 1 video (MP4/MOV/WebM, ≤512 MB). Mixing image with GIF/video is rejected. Images use one-shot `/2/media/upload` (`tweet_image` category). GIF/video use chunked INIT/APPEND/FINALIZE (`tweet_gif` or `tweet_video` category, 4 MB chunks); the command waits on STATUS polling for transcode completion before attaching `media_id` to the tweet (up to 10 minutes).

[!THREADS] To create a thread, post the first tweet, capture its ID from the response, then use `--reply-to <id>` for each subsequent tweet in the chain.

[!EXAMPLES]
- `node x.js post "Hello world"` — text-only.
- `node x.js post "Look at this" --media ./photo.png` — single image.
- `node x.js post "gallery" --media ./a.png,./b.jpg,./c.webp` — multiple images.
- `node x.js post "look at this gif" --media ./fun.gif` — animated GIF.
- `node x.js post "demo video" --media ./clip.mp4` — video (waits for transcode).
- `node x.js post "with reply" --reply-to 1234567890 --media ./img.png` — reply with image.

[!OUTPUT-SHAPE] Returns the API response with `data` containing the created post's `id` and `text`.
