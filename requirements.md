# Medication Reminder App – MVP Requirements

## Overview

This app is a minimal medication reminder tool. It supports **one medication only** and allows users to set reminders based on two simple inputs. Notifications repeat until the user responds.

---

## User Flow

### On First Launch
- User is prompted to:
  1. **Select the time of the first dose**
  2. **Select the interval between doses** (e.g. every 6 hours)

---

## Reminders

### Notification Behaviour
- At the scheduled time, a notification is issued.
- If the user does not interact, **repeat the notification every 2 minutes**.
- Repeats continue **until** the user selects one of the response options.

### Notification Actions (when user taps reminder)
- **Taken – Set Interval Reminder**  
  → Schedules the next reminder at `[scheduled time + interval]`

- **Taken – Last Dose for Day**  
  → Stops all further reminders until the next day

- **Snooze Until [time input, defaults to 4 minutes from now]**  
  → Pauses notifications until selected time

- **Cancel Reminders**  
  → Cancels all future reminders

---

## Constraints

- The app only supports **one active medication**
- No sign-up, login, or cloud sync
- No history, logging, or reports
- All data can be stored locally

---

## Notes

- The app must request notification permissions on first use.
- It must be capable of background notifications and persistent alerts (e.g. if the app is closed).
