// The module catalogue. Order here is the order on the home screen.
import { registerModules, type ModuleDef } from './registry';
import * as B from './babyWidgets';
import * as M from './momWidgets';

const MODULES: ModuleDef[] = [
  // Baby care
  { id: 'glance', space: 'baby', title: 'Since last', blurb: 'Today’s care and time since the last feed, sleep and diaper.', icon: 'moon', hue: 'lilac', size: 'l', defaultOn: true, route: '/baby/today', Widget: B.GlanceWidget },
  { id: 'crycheck', space: 'baby', title: 'Baby sound check', blurb: 'A short recording and recent care logs, with possible things to check.', icon: 'wave', hue: 'mint', size: 'm', defaultOn: true, route: '/baby/sound', Widget: B.CryCheckWidget },
  { id: 'quicklog', space: 'baby', title: 'Quick log', blurb: 'Feed, sleep, diaper or baby sounds, in one place.', icon: 'plus', hue: 'sky', size: 'm', defaultOn: true, Widget: B.QuickLogWidget },
  { id: 'soothe', space: 'baby', title: 'Soothe', blurb: 'White noise, shushing, heartbeat and lullaby, plus what helped.', icon: 'wave', hue: 'lilac', size: 's', defaultOn: true, route: '/baby/soothe', Widget: B.SootheWidget },
  { id: 'insights', space: 'baby', title: 'Insights', blurb: 'Family timeline and weekly patterns from your care logs.', icon: 'chart', hue: 'mint', size: 'm', defaultOn: true, Widget: B.InsightsWidget },
  { id: 'growth', space: 'baby', title: 'Growth', blurb: 'Weight, length and head size over time.', icon: 'leaf', hue: 'mint', size: 's', defaultOn: true, route: '/baby/growth', Widget: B.GrowthWidget },
  { id: 'vaccines', space: 'baby', title: 'Vaccines', blurb: 'Your region\'s schedule with what\'s due next.', icon: 'shield', hue: 'butter', size: 's', defaultOn: true, route: '/baby/vaccines', Widget: B.VaccinesWidget },
  { id: 'milestones', space: 'baby', title: 'Milestones', blurb: 'First smiles and rolls, with a photo and a note.', icon: 'heart', hue: 'blush', size: 'm', defaultOn: true, route: '/baby/milestones', Widget: B.MilestonesWidget },
  { id: 'recent', space: 'baby', title: 'Recent', blurb: 'The last few logs.', icon: 'list', hue: 'sky', size: 'm', defaultOn: true, route: '/baby/timeline', Widget: B.RecentWidget },
  { id: 'patterns', space: 'baby', title: 'Last 7 days', blurb: 'Patterns that are honest about missing days.', icon: 'chart', hue: 'sky', size: 's', defaultOn: true, route: '/baby/patterns', Widget: B.PatternsWidget },
  { id: 'visit', space: 'baby', title: 'Doctor visit', blurb: 'A printable one-page summary plus your questions.', icon: 'clipboard', hue: 'butter', size: 's', defaultOn: true, route: '/baby/visit', Widget: B.VisitWidget },
  // My space
  { id: 'checkin', space: 'mom', title: 'Check in', blurb: 'Mood, energy, rest, pain, support. Skip anything.', icon: 'heart', hue: 'blush', size: 's', defaultOn: true, route: '/me/checkin', Widget: M.CheckinWidget },
  { id: 'hydration', space: 'mom', title: 'Water', blurb: 'Tap a glass. That\'s it.', icon: 'drop', hue: 'sky', size: 's', defaultOn: true, Widget: M.HydrationWidget },
  { id: 'wins', space: 'mom', title: 'One good thing', blurb: 'One thing that went okay today.', icon: 'sun', hue: 'butter', size: 'm', defaultOn: true, Widget: M.WinsWidget },
  { id: 'journal', space: 'mom', title: 'Voice journal', blurb: 'Talk or write. You review every word.', icon: 'mic', hue: 'lilac', size: 's', defaultOn: true, route: '/me/journal', Widget: M.JournalWidget },
  { id: 'supportchat', space: 'mom', title: 'Emi', blurb: 'A gentle conversation with your Embrace AI companion.', icon: 'leaf', hue: 'mint', size: 'm', defaultOn: true, route: '/me/emi', Widget: M.SupportChatWidget },
  { id: 'medicines', space: 'mom', title: 'Medicines', blurb: 'Reminders from your clinician\'s instructions.', icon: 'pill', hue: 'mint', size: 's', defaultOn: true, route: '/me/medicines', Widget: M.MedicinesWidget },
  { id: 'recovery', space: 'mom', title: 'Recovery', blurb: 'How your body is healing, plus warning signs.', icon: 'leaf', hue: 'peach', size: 's', defaultOn: true, route: '/me/recovery', Widget: M.RecoveryWidget },
  { id: 'appointments', space: 'mom', title: 'Follow ups', blurb: '6-week check, stitch review, blood pressure.', icon: 'clipboard', hue: 'sky', size: 's', defaultOn: true, route: '/me/appointments', Widget: M.AppointmentsWidget },
  { id: 'partner', space: 'mom', title: 'Partner nudges', blurb: 'A kind prompt to your partner when you log low rest.', icon: 'person', hue: 'peach', size: 'm', defaultOn: true, Widget: M.PartnerWidget },
  { id: 'share', space: 'mom', title: 'Share', blurb: 'An approved summary, by QR for 15 minutes or by message.', icon: 'share', hue: 'lilac', size: 's', defaultOn: true, route: '/me/share', Widget: M.ShareWidget },
  { id: 'questionnaire', space: 'mom', title: 'Well-being', blurb: 'Five weekly questions (placeholder instrument).', icon: 'clipboard', hue: 'blush', size: 's', defaultOn: true, route: '/me/questionnaire', Widget: M.QuestionnaireWidget },
  { id: 'letter', space: 'mom', title: 'Letter to my baby', blurb: 'A keepsake letter built from milestones and moments.', icon: 'edit', hue: 'blush', size: 'm', defaultOn: true, route: '/me/letter', Widget: M.LetterWidget },
  { id: 'lactation', space: 'mom', title: 'Lactation support', blurb: 'Feeding logs, trusted support and questions for a professional.', icon: 'bottle', hue: 'peach', size: 's', defaultOn: true, route: '/me/lactation', Widget: M.LactationWidget },
  { id: 'nutrition', space: 'mom', title: 'Postpartum nutrition', blurb: 'Gentle guidance and links to trusted resources.', icon: 'leaf', hue: 'mint', size: 's', defaultOn: true, route: '/me/nutrition', Widget: M.NutritionWidget },
];

registerModules(MODULES);
