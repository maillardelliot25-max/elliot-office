import Hero from "@/components/Hero";
import FlameSweep from "@/components/FlameSweep";
import HeritageSection from "@/components/HeritageSection";
import PillarsSection from "@/components/PillarsSection";
import HSESection from "@/components/HSESection";
import TalentPipelineSection from "@/components/TalentPipelineSection";
import KingAaronSection from "@/components/KingAaronSection";
import CTASection from "@/components/CTASection";

export default function Home() {
  return (
    <>
      <Hero />
      <HeritageSection />
      <FlameSweep />
      <PillarsSection />
      <HSESection />
      <TalentPipelineSection />
      <KingAaronSection />
      <CTASection />
    </>
  );
}
