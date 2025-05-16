# App Requirements

## Purpose
Create a basic Expo app to verify that the development setup is working.

## Platform
- Built with Expo (using `create-expo-app`)
- Target: Mobile (iOS and Android)
- No additional libraries beyond Expo defaults

## App Structure
- Single screen
- No navigation

## Functionality
- On launch, the app displays centred text:
  
yay the app is working

markdown
Copy
Edit

## Layout
- Use a `View` component with full screen (`flex: 1`)
- Content should be vertically and horizontally centred using `justifyContent: 'center'` and `alignItems: 'center'`
- Use a `Text` component for the message

## File Structure
- Use default Expo file structure
- Keep everything in `App.js` (or `App.tsx` if using TypeScript)

## Styling
- No external stylesheets or libraries
- Use inline styles only

## Other
- Do not include any navigation, forms, buttons, or logic
- No internet calls or assets