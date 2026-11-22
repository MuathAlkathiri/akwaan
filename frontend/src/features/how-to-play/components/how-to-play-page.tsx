import { HowToPlayCta } from "./how-to-play-cta";
import { HowToPlayDetails } from "./how-to-play-details";
import { HowToPlayHero } from "./how-to-play-hero";
import { HowToPlayJourney } from "./how-to-play-journey";

/**
 * The How to Play walkthrough.
 *
 * A scrollable product story rather than a help article: the hero shows the room
 * a Match is played in, four steps walk through getting there, the written
 * sections under them answer what a newcomer actually asks — what you need, how
 * players join, how a Match is built, how points are counted — and the page ends
 * on the same action the home page leads with.
 *
 * It paints no surface of its own. The shell already supplies the cream canvas
 * and the cosmic background every player page shares, so this only lays content
 * on top of it.
 */
export function HowToPlayPage() {
  return (
    <div className="relative pb-4">
      <HowToPlayHero />
      <HowToPlayJourney />
      <HowToPlayDetails />
      <HowToPlayCta />
    </div>
  );
}
