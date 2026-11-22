# Sourcing: animations (2026-10-20, research only — nothing bought or downloaded)

Fab pages blocked automated reading for this pass, so pack formats below were unconfirmed until checked (see SHORTLIST.md for what Fab's listing data says).

## A. Paired (two-body) zombie moves
| Pack | What | Notes |
|---|---|---|
| **Brutal Zombie Finisher Animation Pack** ([Fab](https://www.fab.com/listings/666629ba-335b-4f7e-a6d8-614753eefe63)) | 53 zombie finishers, each an ATTACK clip + a player REACT clip: front grabs, pounces, takedowns, ceiling ambushes. UE5 mannequin, hand-keyed in Maya. | The best match found. |
| **Slow Zombie Animation Pack**, nikoff ([Fab](https://www.fab.com/listings/4c36aa2c-4e71-4595-b089-2927e2536687)) | 80 mocap clips incl. "paired zombie and player grab-and-bite", window traversal, deaths | |
| **Zombie Animation \| Vicon Mocap** ([Fab](https://www.fab.com/listings/05072bc7-3e21-46a7-951a-8fe5cd56210b)) | 86 clips, 120 fps Vicon mocap; human–zombie interaction start/loop/end ×2 (a grab-and-struggle shape) | |
| **Zombie Movement and Modular Interaction**, bytesumpi (£10, [Gumroad](https://bytesumpi.gumroad.com/l/gxuubf) / [Fab](https://www.fab.com/listings/0ab8b490-0903-479e-ba78-41a5324a559f)) | idle→grab, grab→takedown, "get munched", wrestling, recovery | |
| MoCap Online "Zombie Pro" ($49.99 on sale to Nov 2) | zombie side only, no victim clips | FBX, licence to 1M users |
| ActorCore | has two-actor combat/takedown packs (FBX/BVH, export licence needed), **no zombie pack found** | |
| Unity Asset Store | no paired zombie–victim pack; human takedown packs exist | Unity says its assets may be used in other engines |

- **Pulling a zombie off an ally** and **a crawler grabbing an ankle**: no pack found anywhere — these get acted out or built in code.
- **Mixamo pairs** (free; separate downloads, alignment unconfirmed): Strangling / Being Strangled, Stealth Assassination (assassin / victim), **Brutal Assassination** (with a pipe — a zombie execution), Double Leg Takedown, Grab And Slam, Shoulder Throw, Taken Hostage, **Pull Pilot From Seat / Pulled From Seat** (a pull-off stand-in), Carrying / Being Carried. Zombie bites: Zombie Biting (victim on the ground), Zombie Repeatedly Biting A Neck, Zombie Headbutt With Hand Grab — no victim halves.

## B. Mixamo names for the missing moves
Names come from a public index of 2,446 Mixamo titles (used as a name list only; the files come from mixamo.com).

| Move | Candidates | Status |
|---|---|---|
| Walking/running with a flashlight | the **Standing Torch** set (walk/run 4 directions, idle 01–04, inspect, turns), **Crouch Torch** walk/idle, Unarmed Equip Torch | ✅ (a held torch — swap the prop) |
| Two-handed heavy swing | Heavy Weapon Swing, Bash, Standing Melee Attack Downward | ✅ |
| Hammering / nailing | — (nearest: Working On Device, Banging Fist) | ❌ act or build |
| Standing bench work | Working On Device, Kneeling Inspecting | ⚠️ weak |
| Heavy door | Opening Door Inwards, Open Door Outwards, Opening, Push / Push Start / Push Stop, Pull Heavy Object, Pulling Lever | ✅ |
| Kicking a door | Rifle Turn And Kick (with a rifle); Kicking, Mma Kick | ⚠️ |
| Startled | Reacting, Terrified, Look Over Shoulder, Nervously Look Around, Walk Backwards (in fear), Crawl Backwards, Hiding | ✅ |
| Sitting against a wall | Sitting Dazed, Sitting Idle, Sitting Rubbing Arm | ✅ |
| Into / out of bed | Lying Down, Laying Idle/Sleeping; out: Getting Up, Standing Up | ⚠️ out of bed weak |
| Crying | Crying, Sad Idle, Sad Walk | ✅ |
| Hugging | — | ❌ act |
| Grieving over a body | Kneeling Down, Kneeling, Praying (falling to knees), Agony, Defeated | ✅ |
| Coughing standing | — (lying only) | ❌ act |
| Shivering | — | ❌ act |
| Stagger | Injured Stumble Idle, Jogging Stumble, Stumble Backwards, the Injured_* set | ✅ |
| Injecting | — (Taking A Pill, Using An Inhaler, both lying) | ❌ act |
| Bandaging | — | ❌ act |
| Opening a can / eating | Sitting Drinking, Drinking | ⚠️ eating missing |
| Fireman's carry | Carrying / Walking / Running (while carrying someone) + Being Carried ×3 | ✅ pair |
| Ladder | Climbing Ladder, Climbing, Climbing To Top, Start Climbing Ladder | ✅ |
| Vent crawl | Crawl Forward, Crawling, Low Crawl, Running Crawl | ✅ |
| Prying with a crowbar | — (Pulling Lever, Pull Heavy Object) | ❌ act or build |

## C. Phone-video motion capture
**Most tools capture ONE person per video** (Rokoko says no AI tool does two convincingly). For grabs and struggles the plan is to film each person separately against a stand-in and line them up on the bench.

| Tool | Free | Paid | Formats | Two people? | Commercial use |
|---|---|---|---|---|---|
| **Rokoko Vision 3.0** | 30 s/month | $12/mo → 600 s; $20 → 3,000 s | FBX (BVH from Basic); Mixamo/UE5 skeleton presets | no | you keep the rights |
| **Move One** (move.ai) | 30 credits once | $18/mo → 60 credits | FBX, USD | no | unconfirmed on free |
| **DeepMotion Animate 3D** | 60 s/month (non-commercial) | ~$15/mo+ | FBX, BVH, GLB | **yes, 2–8** | paid tiers only |
| **Plask** | 15 s/day (non-commercial) | $18/mo → 10 min | FBX, GLB, BVH | **yes** | "commercial plan" only — confirm which |
| QuickMagic | free plan | ~$10–50/mo | FBX, BVH, Mixamo | "multi-subject" | per plan |
| Autodesk Flow Studio | ~30 s/month | tiers | FBX + hands | up to 4 actors (export unclear) | not checked |

**Recommendation:** one month of **Rokoko Vision Basic ($12)** for the single-person moves (hammering, bandaging, injecting, coughing, shivering, hugging halves, prying), plus a **DeepMotion or Plask paid month** only if the two-person grabs won't line up when filmed separately.
