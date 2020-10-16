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


## TODO (by priority)
- Clean out the css style code for the ROOM page
- LIMIT number of users in a room to 2 (do it client side or maybe server side)
- verify account firebase
- HIDE serviceAccountKey.json config as an env variable for security on deployment?
- Need fix that you refresh to see a user joining on heroku version (peerjs or socket related error?)
- peer JS key for connection?? (need to investigate more)

## Demo account:
Email: demo-account@mediochat.com
Pass: dSETvxX=bm6EL2@b
