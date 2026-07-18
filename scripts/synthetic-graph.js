export function createSyntheticGraph({ roots = 6, depth = 4, childrenPerFamily = 3 } = {}) {
  const people = {};
  const families = [];
  let personSequence = 0;
  let familySequence = 0;
  const addPerson = generation => {
    personSequence += 1;
    const id = `I${personSequence}`;
    people[id] = {
      id,
      name: `Synthetic Person ${personSequence}`,
      birth: String(1900 + generation * 25),
      death: '',
      birthPlace: '',
      deathPlace: '',
      occupation: ''
    };
    return id;
  };

  for (let root = 0; root < roots; root += 1) {
    let anchors = [addPerson(0)];
    for (let generation = 0; generation < depth; generation += 1) {
      const nextAnchors = [];
      anchors.forEach(anchorId => {
        const partnerId = addPerson(generation);
        const children = Array.from({ length: childrenPerFamily }, () => {
          const childId = addPerson(generation + 1);
          nextAnchors.push(childId);
          return childId;
        });
        familySequence += 1;
        families.push({
          id: `F${familySequence}`,
          partners: [anchorId, partnerId],
          children,
          marriage: '',
          divorce: '',
          separation: '',
          annulment: ''
        });
      });
      anchors = nextAnchors;
    }
  }

  return { people, families, sources: {} };
}
