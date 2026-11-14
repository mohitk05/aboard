import { Link } from "react-router";
import type { Me } from "../api";
import { useMe } from "../auth";
import { useFellowTravellers, useStartChat } from "../people";
import { Badge, Button, Card, FormError, Notice, Tags } from "../ui";
import { Shell } from "./Shell";

export function People() {
  const me = useMe().data as Me;
  const fellow = useFellowTravellers();
  const chat = useStartChat();
  const where = me.state === "ONBOARD" ? "In your carriage" : "At your station";
  const mine = me.interests.map((i) => i.id);

  return (
    <Shell>
      <Card aria-labelledby="people-title" role="region">
        <h1 id="people-title">{where}</h1>
        <p className="muted">
          {me.state === "ONBOARD"
            ? "Travellers on your train who share something with you."
            : "Travellers here who share something with you. Some of them might be catching your train."}
        </p>
        {!me.interests.length && (
          <Notice tone="informational">
            Add some interests on your <Link to="/profile">profile</Link> so we can find people for you.
          </Notice>
        )}
        <FormError message={fellow.error?.message ?? chat.error?.message} />
        {fellow.data && !fellow.data.length && me.interests.length > 0 && (
          <p className="muted">Nobody here shares your interests yet. People come and go with the trains.</p>
        )}
        <ul className="people">
          {fellow.data?.map(({ user, score }) => (
            <li key={user.id}>
              <div className="avatar" aria-hidden>
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="person">
                <strong>
                  {user.username}
                  {user.bot && <Badge>Bot</Badge>}
                </strong>
                <span className="muted small">
                  {Math.round(score)}% in common{user.bot ? " · runs its own business, and doesn't chat" : ""}
                </span>
                <Tags items={user.interests} strong={mine} label={`${user.username}'s interests`} />
              </div>
              {!user.bot && (
                <Button small onClick={() => chat.mutate(user.id)} disabled={chat.isPending}>
                  Say hello
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
