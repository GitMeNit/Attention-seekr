# Disclaimer

This is a satirical project.  
No, you are not legally required to watch ads.
A year or so ago, one of my friends said something that randomly stuck with me.

She was talking about how creative people behind ads and marketing barely get any appreciation for the amount of work they put in.  
Planning, editing, writing, designing, rendering… all that effort just for people to sit there waiting for the **“Skip Ad”** button to appear.

She used YouTube ads as the example and honestly, she wasn’t wrong.

And then I had this random thought:

> “what if you actually had to watch the ad to get to the video?”

So I made this.

It sat on my local disk for more than a year doing absolutely nothing until I was cleaning up storage and found it again.  
Figured it was kinda interesting, so here it is now.

This isn’t some deep anti-user thing or whatever.  
I just thought the idea was interesting — flipping the usual flow where ads are treated like interruptions instead of actual content people spent time making.

Most people only remember the video.  
Nobody remembers the people who made the ad before it.

So yeah, this project exists because of one random conversation and a dumb little “what if” idea.
p.s: ik you can't leagally make anyone watch something.


## How it works
1. **Python tracker** uses your webcam + MediaPipe to detect whether you're looking at the screen.
2. **Chrome extension** polls the tracker on YouTube and pauses ads when you look away, then resumes when you look back.
3. Regular video playback is not affected — only ads.
## Setup
### 1. Python eye tracker
```bash
cd python_tracker
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
python eye_tracker.py
```
A webcam window opens. Press `q` to quit. The API runs at `http://localhost:5000`.
### 2. Chrome extension
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension` folder
4. Open YouTube — tracking auto-starts (toggle in the extension popup)
