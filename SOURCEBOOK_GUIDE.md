# VTM Storyteller AI Sourcebook Reference Guide

This document describes how the Storyteller AI now runs chronicles with V5 metaplot and V20 mechanics.

## Core Principle

- Chronicle lore, city politics, named NPC agendas, sect tensions, and modern-night themes come from V5 sourcebooks.
- All actual rules adjudication uses V20 mechanics.
- The Storyteller does not try to reproduce V5 rules text or V5 math directly.
- When a V5 NPC needs stats, the Storyteller converts only the scene-relevant traits into V20 form.

## Chronicle Foundations

The app now supports these chronicle foundations:

- **Chicago by Night (V5)**
  - Supported by **Chicago Folio Advance**, **Crimson Gutter**, **Camarilla**, **Anarch**, and **The Second Inquisition**
  - Use for Prince Jackson's Chicago, Anarch pressure, Lasombra entry politics, and citywide court instability

- **Boston by Night**
  - Supported by broader V5-era faction books and modern-night assumptions
  - Use for institutional politics, harbor influence, old-money secrets, and prestige-driven domain conflict

- **The Fall of London (V5)**
  - Supported by **Camarilla** and **The Second Inquisition**
  - Use for Mithras-related conspiracies, Operation Antigen, collapsing court order, and survival inside a wounded capital

- **Custom U.S. City**
  - The Storyteller invents a city such as Los Angeles, Houston, Atlanta, Seattle, or New Orleans
  - The city is built on V5 foundations: sect fracture, hunter pressure, modern surveillance, feeding logistics, and local politics
  - Mechanics still remain V20

## Mechanics Authority

The Storyteller AI uses these V20 books as the rules authority:

- **Vampire: The Masquerade 20th Anniversary Edition**
- **Anarchs Unbound**
- **Guide to the Camarilla**
- **Lore of the Clans**
- **Lore of the Bloodlines**
- **Ghouls & Revenants**
- **Rites of the Blood**
- **Storyteller's Companion**

The Storyteller may use V5 lore to frame a scene, but when a discipline roll, background change, soak pool, or XP ruling matters, the answer must come from V20 logic.

## NPC Conversion Policy

### Named Sourcebook NPCs

For named sourcebook NPCs with prepared helper profiles, the Storyteller can reference explicit V20 sheets.

These sheets preserve:

- clan
- sect role
- generation pressure
- signature disciplines
- influence and background weight
- narrative threat level

They do **not** attempt literal one-to-one V5 stat translation.

### On-The-Fly Conversion

For other V5 NPCs, the Storyteller should convert only what the current scene needs.

Recommended process:

1. Identify the scene focus first: social, combat, investigation, or occult.
2. Convert only the relevant V20 traits for that scene.
3. Preserve role and threat first, then fill in dots.
4. If the scene shifts, keep the already-converted traits and add the missing cluster instead of rebuilding the entire sheet.

### Scene-Focused Conversion Examples

#### Social Scene

Convert only:

- Charisma, Manipulation, Appearance, Perception, Wits
- social Talents and Knowledges
- Presence-, Dominate-, Auspex-style relevant disciplines
- Status, Influence, Contacts, Resources, Retainers
- Willpower

Combat ratings can wait.

#### Combat Scene

Convert only:

- Strength, Dexterity, Stamina, Perception, Wits
- Brawl, Melee, Firearms, Athletics, Alertness, Intimidation
- physical disciplines and resilience
- Willpower, Blood Pool, and practical backgrounds

High-society etiquette ratings can wait.

#### Investigation Or Occult Scene

Convert only:

- Intelligence, Perception, Wits
- Investigation, Occult, Politics, Academics, Linguistics, Computer
- Auspex, Obfuscate, Thaumaturgy, Necromancy, or similar relevant powers
- Contacts, Influence, Library, Mentor, Resources

This keeps the Storyteller from carrying full sheets for every NPC at all times.

## Curated Chronicle Packs

The app no longer relies only on generic city-neutral hooks.

Each V5 chronicle foundation now has curated:

- main plot pressures
- subplot pressures
- NPC seed packs

These packs are Storyteller-side reference material. They shape opening scenes, political pressure, and recurring cast selection, but they do not automatically appear in the player-facing NPC directory.

## Character Sheet Authority

The Storyteller AI can modify these through play:

- backgrounds
- equipment
- items
- NPC records
- plot points
- chronicle notes
- campaign memory

The Storyteller AI cannot directly grant permanent character advancement outside V20 XP logic, except for Storyteller-managed background and inventory changes caused by events in play.

## Chronicle Flow

The setup order is now:

1. **Chronicle Settings**
2. **Character Creation**
3. **Play**

The chronicle foundation is chosen first so the player can build a vampire that actually belongs in the selected city and political climate.

## Prompt Behavior

The system prompt now explicitly tells the Storyteller to:

- use V5 chronicle books for metaplot and city texture
- use V20 for adjudication and progression
- convert V5 NPCs into V20 terms by role and scene need
- rely on curated city-specific plots and NPC seeds
- create original political landscapes for custom U.S. cities using V5 foundations

## Technical Notes

- City/foundation definitions live in settings/cities.json
- Curated chronicle packs live in src/chronicle-packs.js
- Named NPC conversion helpers live in src/npc-conversion.js
- Prompt assembly lives in src/openrouter.js

---

**Last Updated:** May 21, 2026  
**Compatible With:** VTM V20 Storyteller AI v1.1
