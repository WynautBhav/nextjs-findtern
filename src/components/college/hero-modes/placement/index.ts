import type { PlacementData } from "@/lib/college/overview-modes";
import { OfferRiver } from "./d01-offer-river";
import { SankeyFlow } from "./d02-sankey-flow";
import { FunnelTower } from "./d03-funnel-tower";
import { OfferRings } from "./d04-offer-rings";
import { BandLadders } from "./d05-band-ladders";
import { StudentWaffle } from "./d06-student-waffle";
import { Scoreboard } from "./d07-scoreboard";
import { CoffeeCups } from "./d08-coffee-cups";
import { BulletBands } from "./d09-bullet-bands";
import { TicketStubs } from "./d10-ticket-stubs";

/** Placement analysis designs, in the order the picker shows them. Each takes the same data. */
export const PLACEMENT_DESIGNS: { name: string; Component: (p: { data: PlacementData }) => React.ReactNode }[] = [
  { name: "Offer river", Component: OfferRiver },
  { name: "Sankey flow", Component: SankeyFlow },
  { name: "Funnel tower", Component: FunnelTower },
  { name: "Offer rings", Component: OfferRings },
  { name: "Band ladders", Component: BandLadders },
  { name: "Student waffle", Component: StudentWaffle },
  { name: "Scoreboard", Component: Scoreboard },
  { name: "Coffee cups", Component: CoffeeCups },
  { name: "Bullet bands", Component: BulletBands },
  { name: "Ticket stubs", Component: TicketStubs },
];
