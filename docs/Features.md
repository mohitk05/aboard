# Features and Frontend Task Distribution

The frontend would be a SPA built in React. Choosing React is the best decision for now given its large number of open source libraries and integrations, majorly with three.js (react-three-fiber), since I plan to use three.js for 3d graphics in the game.

Marketing site would be separate and can be planned independently post dev.

On the SPA, there would be these major pieces according to the player's current state:

### Logged-out State

Login screen shown which calls the login/signup API and reads user's current location/timezone logic to estimate nearest stop. Integrate Google/FB signin. Logging in would land you to the game screen.

### The Game

This can be considered as the second layer after someone logs in. From here it can be decided according to player's current `state`, which route is to be shown. Currently we have 3 user states defined:

##### ATSTATION

This is the default state user lands into after signing up. This denotes that the user is at a particular stop, mentioned by the `currentStop` property in the user object.
One can also land into this state when they get off at some station and do not have an active ticket.
Possible state transitions:

-   (signup) -> ATSTATION
-   ONBOARD -> ATSTATION
-   ATSTATION -> READYTOGO

Frontend Requirements:

-   A station view with details of the currentStop. Get current stop details from /stop API.
-   INCOMING vehicles list, limited at n = 5 (a paginated API for this) with expected arrival time.
-   A ticketing window view - flow should be like - browse through stops, choose one, vehicles are listed which go to or via the stop, choose vehicle, buy ticket -> user moved to READYTOGO.
-   Fellow travellers explore view - a way to see other people currently at the stop - an API providing a list of users at a stop (maybe with certain filters applied, filters can be added/removed) in the ATSTATION/READYTOGO state.

##### READYTOGO

This is the state a user lands into when they buy a ticket to travel. Possible transitions:

-   ATSTATION -> READYTOGO
-   READYTOGO -> ONBOARD
-   READYTOGO -> ATSTATION

Frontend:

-   Current ticket view - option to change stop (not required in MVP), cancel ticket. If canceled, user moves to ATSTATION state.
-   Fellow travellers view - same as ATSTATION, added prompts that time is running out -> invite user to your vehicle -> sends a message to target user saying buy a ticket.
-   Set a timeout for polling of vehicle update to start 10 mins before the arrival
-   On user state update, change view

##### ONBOARD

This is the state when user is travelling inside a vehicle. Possible transitions:

-   READYTOGO -> ONBOARD
-   ONBOARD -> ATSTATION

Frontend:

-   Vehicle view, some interesting moving graphics (not MVP)
-   Current vehicle info - route info, next stop, arrival time, arrival time to your destination
-   More concentration on conversations with fellow passengers
-   List of passengers, filtered acc to interests
-   Option to change destination stop, if its after the original one, then buy new ticket.

### General Points

The world updates every 1 world interval, usually 15mins. But some things as noted below happen in realtime:

-   Messages are sent as soon as a user hits send, i.e. they do not wait for the world cycle to run
-   Same goes for tickets. When a user buys one, their state changes
-   Messages would initially be asynchronous, but can be made realtime. Anonymity is crucial. Interest matching would be key.
