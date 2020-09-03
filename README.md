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
4. Make sure that ```LOCAL_DEBUG``` in ```server.js``` and ```script.js``` are set to ```true```. For deployment to Heroku, set to ```false```.

## Heroku deployment
1. Commit and push all the latest changes to the REPO first
2. Set ```LOCAL_DEBUG``` in ```server.js``` and ```script.js``` to ```false```.
3. Commit for a heroku deployment: 
```
git commit -m "heroku v3"
```
4. Push and deploy:
```
git push heroku master
```


## TODO and suggestions
- upcoming calls firebase indexing issue: FIX, and have a link to start these calls (and make sure all the cookies are set)
- GET DOCTOR NAME FROM AUTH RATHER THAN FROM COOKIE ON PREV PAGE: helps avoid setting a cookie for upcoming calls!
- ERROR MESSAGE FLASHING
- LIMIT number of users in a room to 2 (do it client side or maybe server side)
- Forgot password reset and verify account firebase
- Factor out frontend code from login and signup views
- HIDE serviceAccountKey.json config as an env variable for security on deployment?
- Need fix that you refresh to see a user joining on heroku version (peerjs or socket related error?)
- peer JS key for connection?? (need to investigate more)
- socket.io error on the frontend?

## Links
- [Original video: How to make a Zoom clone](https://www.youtube.com/watch?v=DvlyzDZDEq4)
- [Firebase auth with nodejs](https://www.youtube.com/watch?v=kX8by4eCyG4)
- [Same tutorial as original but with a better room UI and a chat message function](https://www.youtube.com/watch?v=ZVznzY7EjuY)
