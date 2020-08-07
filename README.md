## Setup on a local computer
1. Install all the dependencies:
```
npm install
```
2. Run the development server with autorefresh on changes:
```
npm run devStart
```
3. Start the PeerJS server:
```
peerjs --port 3001
```
4. Make sure that ```LOCAL_DEBUG``` in ```server.js``` and ```script.js``` are set to true. For deployment to Heroku, set to false.

## TODO and suggestions
- Error catching on the frontend for signup.ejs and login.ejs when Firebase returns errors (ie password too short, or incorrect details)
- Firebase data store APIs for creating rooms, doctor details, other...
- Improve room UI using the 3rd video on the list below
- Add a chat to a video room
- Limit who can join a room using cookies?
- Forgot password reset and verify account firebase
- Factor out frontend code from login and signup views
- HIDE serviceAccountKey.json config as an env variable for security on deployment?
- Need fix that you refresh to see a user joining on heroku version (peerjs or socket related error?)
- socket.io error on the frontend?

## Links
- [Original video: How to make a Zoom clone](https://www.youtube.com/watch?v=DvlyzDZDEq4)
- [Firebase auth with nodejs](https://www.youtube.com/watch?v=kX8by4eCyG4)
- [Same tutorial as original but with a better room UI and a chat message function](https://www.youtube.com/watch?v=ZVznzY7EjuY)
