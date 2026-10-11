import streamDeck from "@elgato/streamdeck";

import { UsageStat } from "./actions/usage-stat";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new UsageStat());

streamDeck.connect();
