import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import challenges from "./challenges";
import { LeaderboardRequest, LeaderboardResponse } from "./api_types";

type LoadState = {
    status: "init",
} | {
    status: "loading",
    challenge_name: string,
} | {
    status: "failed",
    challenge_name: string,
} | {
    status: "ready",
    challenge_name: string,
    response: LeaderboardResponse,
};

function App() {
    // const username = "CatsAreFluffy"

    const [challenge_name, setChallengeName] = useState(
        () => {
            return challenges.keys().next().value!;
        }
    );

    const [scoring, setScoring] = useState<"bytes" | "frontier" | "cycles">("bytes");
    const [max_bytes, setMaxBytes] = useState(0);

    const [load_state, setLoadState] = useState<LoadState>({status: "init"});

    const handleSelectChallenge = (challenge_name: string) => () => {
        setChallengeName(challenge_name);
    };

    const challenge_buttons = [];
    for(const challenge of challenges.keys()) {
        challenge_buttons.push(<button key={challenge} onClick={handleSelectChallenge(challenge)}>{challenge}</button>);
    }

    const handleSelectScoring = (scoring: "bytes" | "frontier" | "cycles", max_bytes: number) => () => {
        setScoring(scoring);
        setMaxBytes(max_bytes);
    };


    const scoring_buttons = [];
    const button_descs: ["bytes" | "frontier" | "cycles", number, string][] = [
        ["bytes", 0, "Bytes"],
        ["frontier", 0, "Frontier"],
        ["cycles", 128, "Cycles <128B"],
        ["cycles", 256, "Cycles <256B"],
        ["cycles", 512, "Cycles <512B"],
    ];
    for(const [scoring, max_bytes, desc] of button_descs) {
        scoring_buttons.push(<button key={desc} onClick={handleSelectScoring(scoring, max_bytes)}>{desc}</button>);
    }

    useEffect(() => {
        let ignore = false;
        setLoadState({status: "loading", challenge_name});
        const request: LeaderboardRequest = {challenge_name, scoring, max_bytes};
        fetch("/leaderboard",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            }
        ).then(async (response) => {
            if(ignore) {
                return;
            }
            if(response.status != 200) {
                setLoadState({status: "failed", challenge_name});
                return;
            }
            const rows: LeaderboardResponse = await response.json();
            console.log(rows);
            setLoadState({status: "ready", challenge_name, response: rows});
        });
        return () => {ignore = true;};
    }, [challenge_name, scoring, max_bytes]);

    const header = <>
        <h1>6502 Golf</h1>
        <a href="/index.html">Back to the game</a>
        <div>Challenges: {challenge_buttons}</div>
        <div>Scoring: {scoring_buttons}</div>
    </>;
    switch(load_state.status) {
        case "init":
            return <div className="app">{header}</div>;
        case "loading":
            return <div className="app">{header}<div>Loading...</div></div>;
        case "failed":
            return <div className="app">{header}<div>Failed to load :(</div></div>;
        case "ready": {
            const rows = [<tr key={0}><td>User</td><td>Bytes</td><td>Cycles</td></tr>];
            for(const {username, bytes, cycles} of load_state.response) {
                rows.push(<tr key={rows.length}><td>{username}</td><td>{bytes}</td><td>{cycles}</td></tr>);
            }
            return <div className="app">{header}<table className="leaderboard"><tbody>{rows}</tbody></table></div>;
        }
    }
}

// Render your React component instead
const root = createRoot(document.body);
root.render(<App />);
