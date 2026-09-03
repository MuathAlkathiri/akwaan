import { HowToPlayCta } from "./how-to-play-cta";
import { HowToPlayHero } from "./how-to-play-hero";
import { HowToPlayJourney } from "./how-to-play-journey";

/**
 * The How to Play walkthrough.
 *
 * A scrollable product story rather than a help article: the hero shows the room
 * a Match is played in, four steps walk through getting there, and the page ends
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
      <HowToPlayCta />
    </div>
  );
}
