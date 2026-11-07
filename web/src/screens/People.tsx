import { Link } from "react-router";
import type { Me } from "../api";
import { useMe } from "../auth";
import { useFellowTravellers, useStartChat } from "../people";
import { FormError } from "../ui";
import { Shell } from "./Shell";

export function People() {
  const me = useMe().data as Me;
  const fellow = useFellowTravellers();
  const chat = useStartChat();
  const where = me.state === "ONBOARD" ? "In your carriage" : "At your station";

  return (
    <Shell>
      <section className="card" aria-labelledby="people-title">
        <h1 id="people-title">{where}</h1>
        <p className="muted">
          {me.state === "ONBOARD"
            ? "Travellers on your train who share something with you."
            : "Travellers here who share something with you. Some of them might be catching your train."}
        </p>
        {!me.interests.length && (
          <p className="notice-soft">
            Add some interests on your <Link to="/profile">profile</Link> so we can find people for you.
          </p>
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
                <strong>{user.username}</strong>
                <span className="muted small">{Math.round(score)}% in common</span>
                <div className="chips">
                  {user.interests.map((i) => (
                    <span key={i.id} className={`chip chip-small ${me.interests.some((m) => m.id === i.id) ? "is-shared" : ""}`}>
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn btn-small" onClick={() => chat.mutate(user.id)} disabled={chat.isPending}>
                Say hello
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
