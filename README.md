# Wordle Solver PWA

Responsive Wordle solver for phones, tablets and computers.

## Fastest setup

1. Replace `five_letter_words.txt` with your own list.
   - One 5-letter word per line.
   - Lowercase or uppercase is fine.
2. Upload all files in this folder to a GitHub repository.
3. In GitHub:
   - Settings
   - Pages
   - Build and deployment → Deploy from a branch
   - Branch: `main`
   - Folder: `/ (root)`
   - Save
4. GitHub will give you a URL like:
   `https://YOURNAME.github.io/wordle-solver/`

## On your Samsung / Android phone

Open the GitHub Pages URL in Chrome or Samsung Internet.
Use the browser menu and choose **Add to Home screen** / **Install app**.

After the first successful load, the service worker caches the app for offline use.

## On a computer

Open the same URL in any modern browser. Chrome/Edge can also install it as a desktop PWA.

## Word list import

You can also use **Import .txt** inside the app. The imported list is stored locally in that browser using localStorage.

## Solver behavior

- Correctly handles duplicate letters.
- Tap result squares to cycle gray → yellow → green.
- Shows top 3 recommended starting words.
- Shows best next guesses using expected remaining candidates.
- Probe guesses do not have to be possible answers.
- Shows up to 10 likely remaining answers.
- Undo and Reset included.