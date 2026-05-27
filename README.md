# Vampire: The Masquerade Storyteller AI

A Vite-based web app for running Vampire: The Masquerade chronicles with V5-era metaplot and V20 mechanics.

The app supports:
- Chronicle setup by city or custom domain
- Guided V20 character creation
- Storyteller chat via OpenRouter
- NPC directory and chronicle notes
- Chat-native roll prompts for player adjudication
- Persistent local browser save state

## Features

- Guided chronicle setup with city packs or custom domain foundations
- V20-first character creation flow with step-by-step allocation, freebies, and review
- OpenRouter-backed Storyteller chat with structured chronicle and character state updates
- Chat-native dice roll prompts and result posting for player adjudication during play
- NPC directory, chronicle notes, and persistent local browser save state
- In-app discipline and ritual reference overlays for quick rules lookup
- Blood magic support for Thaumaturgy and Necromancy, including primary path selection and ritual tracking
- Expanded V20 Core and Rites of the Blood path data for blood magic disciplines
- Downtime activity support with selectable templates and mechanics-aware prompt generation
- Optional Electron desktop mode alongside the standard web app build

## How It Works

This project uses a split authority model:

- Chronicle lore, politics, mood, city tensions, and named sourcebook NPC framing come from V5 source material.
- Rules adjudication, character sheet logic, progression, and roll structure use V20 mechanics.

In play, the Storyteller AI frames the action and proposes rolls. The app/player executes rolls from chat-native controls, then the Storyteller narrates consequences from the posted result.

## Requirements

- Node.js 20+ recommended
- npm
- An OpenRouter API key for Storyteller chat

## Run The Web App

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open the local URL shown by Vite in your browser.

## Build For Production

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Desktop Mode

This project also includes an Electron entry path.

```bash
npm run desktop
```

## How To Use

1. Open the app.
2. Create a new chronicle.
3. Configure the chronicle foundation first.
4. Create your character manually or use the Character Creation AI Assistant.
5. In the sidebar, paste your OpenRouter API key into the in-app API key field.
6. Save AI settings.
7. Enter the chronicle and chat with the Storyteller.

### During Play

- The Storyteller presents scenes and mechanics prompts.
- When a roll is needed, the Storyteller provides the pool and difficulty in chat.
- Use the in-chat roll controls to resolve the check.
- The app posts the roll result back into chat.
- The Storyteller responds with consequence narration.

## Secrets And Safety

- Do not commit your real OpenRouter key.
- `.env`, `.env.local`, `dist/`, `node_modules/`, extracted source text files, and local resource directories are already ignored by `.gitignore`.
- The OpenRouter key is entered in the app UI and stored locally in browser state on your machine.

If you use Firebase locally, copy `.env.example` to `.env` and fill in your own values.

## Sourcebooks Used

### Metaplot And Chronicle Foundations

These books and reference lines inform the setting, politics, and named chronicle material:

- Vampire: The Masquerade 5th Edition core assumptions for the modern night
- Chicago by Night
- Chicago Folio Advance
- Crimson Gutter
- Camarilla
- Anarch
- The Second Inquisition
- The Fall of London

### Mechanics And Adjudication

These books inform rules authority and V20 mechanics handling:

- Vampire: The Masquerade 20th Anniversary Edition
- Anarchs Unbound
- Guide to the Camarilla
- Lore of the Clans
- Lore of the Bloodlines
- Ghouls & Revenants
- Rites of the Blood
- Storyteller's Companion

## Project Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — build production assets
- `npm run preview` — preview production build locally
- `npm run desktop` — build and launch Electron wrapper
- `npm run extract:v20` — run the V20 extraction helper

## Project Structure

- `src/` — app logic, rendering, prompt assembly, chronicle packs
- `mechanics/` — V20 rules data, clans, merits/flaws, disciplines, nature/demeanor
- `settings/` — city and chronicle configuration
- `electron/` — desktop wrapper
- `SOURCEBOOK_GUIDE.md` — detailed explanation of sourcebook usage policy

## Notes

- Save state is local to the browser on the machine where the app is run.
- NPC archive export is optional and uses local directory access when supported by the browser.
- The NPC directory only includes information actually surfaced through structured Storyteller updates.
