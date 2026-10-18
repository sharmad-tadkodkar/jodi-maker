import {
  Ban,
  Briefcase,
  Flame,
  Gem,
  Globe,
  HeartHandshake,
  Lock,
  MapPin,
  MessageCircle,
  Palette,
  Sparkles,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Aspect, Visibility } from '../api/client'

/** Who sees an aspect (docs/DESIGN.md): shown = globe, matchmaker only = sparkle, private = lock. */
export const VISIBILITY_ICON: Record<Visibility, LucideIcon> = {
  public: Globe,
  agent_only: Sparkles,
  private: Lock,
}

/** One icon per aspect category (Me page cards). Faith uses a diya-like flame — neutral across traditions. */
export const ASPECT_ICON: Record<Aspect['category'], LucideIcon> = {
  values: Gem,
  family_structure: Users,
  career_ambition: Briefcase,
  lifestyle: Sun,
  location_plans: MapPin,
  finances: Wallet,
  faith_practice: Flame,
  communication_style: MessageCircle,
  interests: Palette,
  partner_expectations: HeartHandshake,
  dealbreakers: Ban,
}
