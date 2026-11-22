// DR. VOSS ON THE FIRST TWO ARCHIVES (THE BACKROOMS LAWS, law 1: "dr ada must
// have dialogue and descriptions for every lore drive"). One entry per drive
// of Level 0 (001–020) and the Poolrooms (P01–P20): `desc` is the archive's
// one-line description, `ada` her note on it.
export const LOBBY_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  "001": {
    desc: "A personal log from someone who fell in from a shopping mall, written on their first night.",
    ada: "Room 4-C has been resurveyed eleven times and no stain matching the description has been recorded. The walls are repainted by nothing we have identified. I hope Fred lasted as long as the author needed him to.",
  },
  "002": {
    desc: "A list of six survival rules compiled by an anonymous survivor over three weeks.",
    ada: "Rules one through five hold up under measurement; the flicker lead is closer to three seconds than four, and I would plan on three. Rule six is not a rule. It is a hope, written in the format of a rule.",
  },
  "003": {
    desc: "A cartographer's notes on Level 0's shifting geometry, its boundary zones, and the one locked door.",
    ada: "The ochre shift near the boundaries is real and measurable: a drop of roughly four per cent in reflected wavelength. I took the word \"Threshold\" from this drive, and my station is named for the fourth zone it describes. On the door the author was correct in every particular, and on the key correct to say they did not know.",
  },
  "004": {
    desc: "Dr. Ada Voss's first audio log, recorded shortly after she entered Level 0 on purpose.",
    ada: "The resonance figures in this entry were right. The return vector took me considerably longer than \"working on it\" implies. I notice I asked for someone to find this and not panic; I was, at the time, asking it of myself.",
  },
  "005": {
    desc: "A group survivor's log describing nine people, a meeting room called the Hub, and their losses.",
    ada: "Four corridors meeting at the angles described would require the room to be larger than its own perimeter. We have a room like that. No exit has ever been recorded within a day's walk of it. I am not going to correct what the author chose to think about the two who wandered.",
  },
  "006": {
    desc: "Field notes classifying two entities reported in Level 0: the Bacteria and the Mimic.",
    ada: "Neither name corresponds to anything my surveyors have catalogued in the current sector; what walks Level 0 now is listed under other headings. The advice on voices is nonetheless the best single paragraph in this archive, and I have had it printed on the inside of every survey helmet.",
  },
  "007": {
    desc: "A short essay on where almond water comes from, weighing a natural theory against an intentional one.",
    ada: "Assay shows almond water is not water with almond in it; the ratios do not occur in any orchard. Neither theory can be excluded on the data. I drink it every day, which I recognise is not a vote for either.",
  },
  "008": {
    desc: "An unsigned document claiming to come from whoever built the walls around Level 0's centre.",
    ada: "The paper is not from any mill on record and the ink has no maker's signature. I cannot authenticate the author. I can report that the instruction in the last lines was given to me, here, in writing, and that I did not follow it.",
  },
  "009": {
    desc: "A scanned notebook page written by an eleven-year-old who fell in at a park.",
    ada: "The handwriting and spelling are consistent with the stated age. I have checked every missing-child report within a hundred miles of the casino for the last forty years. I have not found the name, and I am still checking.",
  },
  "010": {
    desc: "A fragment of a radio transmission from an outpost of eleven people at marker YELLOW-7.",
    ada: "No marker by that name exists in any survey grid we have used. The transmission's carrier frequency, however, matches equipment Async did not issue until two years after this drive must have been recorded. I have no explanation for that and have not invented one.",
  },
  "011": {
    desc: "Dr. Voss's seventh audio log, on the rhythms she measured in entity movement over 34 days.",
    ada: "The nineteen-hour circuit was a sound figure for the sector I was in; the current sector is a different map and runs a different clock. The observation about calm still stands. I would amend only the line about my own name: it was not the only voice I heard it use.",
  },
  "012": {
    desc: "An anonymous hypothesis that exits appear when a person stops looking for one.",
    ada: "The accounts collected here are selected for the people who got out, which is the only kind of account that gets collected. That is the whole of the statistical objection. The last sentence I do not have an objection to.",
  },
  "013": {
    desc: "The account of a long-term walker who estimates covering four to six hundred miles of Level 0.",
    ada: "Carpet wear deep enough to read as a groove requires on the order of ten thousand passes; the mileage claimed is, if anything, low. \"Competent but not okay\" is the most accurate self-assessment in this archive. I have used it in a staff review.",
  },
  "014": {
    desc: "A warning, labelled not to be opened, about a room with diamond-patterned wallpaper.",
    ada: "We have recorded rooms with patterned walls in the current sector; none of them held what this describes, and I am aware that is not the same as saying the room does not exist. My surveyors are told to treat this drive as an instruction until I can tell them otherwise.",
  },
  "015": {
    desc: "A supply-cache registry with handwritten entries from several survivors who passed through.",
    ada: "J.T. is the only entry I can trace: a surveyor's tag of that format was issued in the first year and returned, signed, at the seam. I cannot say what M.R.'s Threshold B was; the author's zones were lettered, mine are numbered. Somebody here was keeping good records before I was.",
  },
  "016": {
    desc: "Dr. Voss's final audio log, recorded as she prepared to walk into the centre of Level 0.",
    ada: "I came back. I do not have a recording of the walk out, and I have not been able to reconstruct it from my notes, which stop at the tone. I was here and I was real; I am less certain than I would like that it is the same person reviewing this entry.",
  },
  "017": {
    desc: "A survivor's account of painting remembered images on Level 0's walls with a spray can.",
    ada: "Painted surfaces do alter movement near them; we have measured it, and it is the reason every survey kit carries a can. Whether it is the paint or the intent I cannot isolate, because I have never found a surveyor willing to paint something they did not mean.",
  },
  "018": {
    desc: "A survivor's report on the levels beyond Level 0, from two brief crossings.",
    ada: "The Poolrooms entry is accurate. The second entry is not: the office floors are several doors further down, and the layer under the Poolrooms is the plant, Pipe Dreams, which is the dark industrial level the author lists as a rumour. Each layer holds one door to the next; nobody slips through twice.",
  },
  "019": {
    desc: "A transcript of a looping audio broadcast of unknown origin, recovered from a drive.",
    ada: "The loop is two hundred and fifty-seven seconds, as stated, to within a frame. Voice analysis matches no surveyor and no recording in our library. I have listened to it more often than the analysis required.",
  },
  "020": {
    desc: "A farewell note left by a survivor on the morning they found their exit.",
    ada: "I cannot verify the exit. I can verify that the drive was found in the same place it was written, and that nobody came back for it. I have chosen to file it under outcomes rather than under unknowns, and I have noted that this was a choice.",
  },
};

export const POOL_DRIVE_NOTES: Record<string, { desc: string; ada: string }> = {
  P01: {
    desc: "The first log written by someone arriving in the Poolrooms through the door from Level 0.",
    ada: "The water holds at thirty-six point eight degrees in every sample. The absence of chlorine is confirmed; the absence of any smell at all is not something water does, and I have stopped writing that it is.",
  },
  P02: {
    desc: "A survivor's three days of measurements of the Poolrooms' water level across eleven rooms.",
    ada: "Confirmed: the waterline is one line across the whole level, and a bottle poured out an hour away does not raise it by any amount I can detect. The author's two kilometres has since become a good deal more. There is still no container.",
  },
  P03: {
    desc: "Practical rules for the deep water, written by a survivor who searched the bottom for four days.",
    ada: "Ten seconds before it hurts matches our breath-hold trials closely. Dropped equipment is not recovered; I have stopped issuing anything to a Poolrooms team that I would mind losing. I have also not asked anyone to dive to look, and I will not.",
  },
  P04: {
    desc: "Structural notes counting the arches and piers of the Poolrooms' flooded halls.",
    ada: "Our survey agrees: the spans are consistent and the tile courses align across piers to within two millimetres. The author is right that competence is the disturbing finding. A specification implies a client.",
  },
  P05: {
    desc: "Notes on two deep channels that met at a basin the author called the Confluence.",
    ada: "The current survey of the Poolrooms shows no rivers and no Confluence; the level has been mapped again since this was written, and it is a bathhouse in three zones now. The graded banks the author describes are still everywhere you can walk into deep water, which suggests whatever was intended for the channels was kept.",
  },
  P06: {
    desc: "A survivor's excited log after finding four wooden boats left in the Poolrooms' water.",
    ada: "We count more than four now. The wood shows no rot and no growth after months in continuous immersion, which I cannot account for. Requisition 119 already says not to remove them; I would add, not to assume who they were left for.",
  },
  P07: {
    desc: "A survivor's comparison of the Poolrooms with the yellow rooms of Level 0.",
    ada: "Ambient noise is roughly twenty decibels lower here, and the light sits nearer the blue end, as described. I share the author's conclusion about trust. Level 0 has never once looked like somewhere I would choose to be.",
  },
  P08: {
    desc: "A description of the Poolrooms' circular domed rooms, with stepped pools at their centres.",
    ada: "The echo arrives at four hundred and eighty milliseconds from the centre, which is longer than the dome's radius explains. I have sat on that step myself. I went to time the echo, and I timed it in the first minute.",
  },
  P09: {
    desc: "An account of a long gallery whose walls are cut with circular openings that line up.",
    ada: "Returns from the far rings arrive before sound could have travelled there and back. I have measured it six times and it does not improve with repetition. The author's guess about where it leads is the most reasonable one available.",
  },
  P10: {
    desc: "A warning about the curved, flooded tunnels and paint marks found in the wrong order.",
    ada: "Paint marks in the tunnels are logged by every team now, and roughly one survey in nine reports the sequence the author describes. Nothing in the tunnels has been seen to move. The procedure here, a walkie and somebody at the mouth, is the one I issue.",
  },
  P11: {
    desc: "Notes on round, lit windows set into tunnel walls that have nothing behind them.",
    ada: "The walls are a single cell thick with water on both faces; the light source has no volume to occupy. Two surveyors have reported the same sound the author describes. Both called it water, and both said so twice.",
  },
  P12: {
    desc: "Observations on the polished chrome ladders bolted into the Poolrooms' deep pools.",
    ada: "No corrosion on any ladder we have sampled, after an immersion I estimate in decades. The author's reading of which way they face is correct. I have no better explanation for it than theirs, and I have looked for one.",
  },
  P13: {
    desc: "A survivor's discovery that the Poolrooms' ceiling panels are openings lit from above.",
    ada: "The light is constant across a full cycle and carries no measurable heat. The inference that there is something above the ceiling is sound. The inference that it is a way out does not follow from it; above is not the same as out.",
  },
  P14: {
    desc: "An account of a spiral staircase leading to a gallery overlooking the largest pool hall.",
    ada: "The gallery is the best vantage point on the level and our survey sketches from it disagree with our survey walks too. The discrepancy is small and it is not the same twice. I have stopped attributing it to the sketchers.",
  },
  P15: {
    desc: "A survivor's account of the small private bath rooms and of belongings moved while they were away.",
    ada: "Rearranged belongings have been reported twice more since, both in single rooms, both stacked in a corner. Nothing taken; once something added. I have not told the second surveyor what the first one found, so the accounts would stay independent.",
  },
  P16: {
    desc: "A Threshold-4 materiel requisition for Level 1 survey work, signed by Dr. Voss.",
    ada: "My signature. Every denial on it still stands, and the note about active acoustics I would sign again today. I wrote \"did not return\" because it was the accurate phrase; I knew both teams by name, and I left that off the form as well.",
  },
  P17: {
    desc: "A survivor's notes on clapping in a flooded hall and the echo that came back from below.",
    ada: "The first two returns are consistent with the hall's dimensions. The third is consistent with nothing in it. This is why the requisition reads as it does, and I would ask that nobody repeat the experiment to check either of us.",
  },
  P18: {
    desc: "A survivor's log about a tied boat that was found later, untied, in another part of the level.",
    ada: "Craft positions are logged every survey, and they move between surveys with no one aboard that we know of. The knots I have had examined were undone, not cut, as described. I prefer the author's first version and I have noticed that a preference is not a finding.",
  },
  P19: {
    desc: "Practical advice for new swimmers on surviving the Poolrooms' deep water calmly.",
    ada: "The depth figure is accurate for the deep channels and the physiology is correct: panic spends more air than swimming does. This is the drive I give to every new Poolrooms surveyor. It does not stop them thrashing the first time, but they stop sooner.",
  },
  P20: {
    desc: "A farewell entry from a survivor leaving the Poolrooms after eleven weeks below.",
    ada: "The Landing has not moved in any survey, as stated. The author is right that the Poolrooms is quieter rather than deeper, though it is also deeper; the door under it opens on the plant. I have been down long enough to have favourite rooms as well. I have not been up in some time.",
  },
};
