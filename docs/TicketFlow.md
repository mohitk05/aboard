# Ticket flow

-   When user is ATSTATION, they will be able to browse through stops they can go and all incoming vehicles at the stop they are currently at.
-   They will choose a trip, and then their destination. This will fire the /ticket/buy API with relevant info.
-   Once the ticket is bought, (need to cover credits deduction logic in the API) the ticket is assigned to the user and user state is updated to READYTOGO.
-   In the next world cycle, user is seen as READYTOGO, if the trip vehicle has reached the stop, the user is onboarded. State changed to ONBOARD, until then repeat this.
-   Until user reaches their stop, they are in the train.
-   Once vehicle enters the stop and is STATIONARY, the user is deboarded, the ticket is de-assigned from the user, i.e. user.ticket = null.
-   Alternate flow, if user decides to get off at a different stop in the route:
    -   If the stop is before the ticket destination, maintain a value called `desiredTo` inside ticket. When deboarding give desiredTo more preference over actual `to`. updateTicket will set desiredTo. No price deduction in this case.
    -   If the stop is after the ticket destination, update the `to` value directly and add the extra price accordingly.
    -   Currently, this would be allowed only on the same trip. If trip has to be changed, user needs to get off the vehicle.
