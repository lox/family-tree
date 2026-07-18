const rows = [
  ['I1','Joseph Patrick KENNEDY','M','6 SEP 1888','18 NOV 1969','East Boston, MA','Hyannis Port, MA','Bank President, Ambassador'],
  ['I2','Rose Elizabeth FITZGERALD','F','22 JUL 1890','22 JAN 1995','Boston, MA','Hyannis Port, MA',''],
  ['I3','Joseph Patrick KENNEDY Jr.','M','25 JUL 1915','12 AUG 1944','Hull, MA','Suffolk, England','Naval aviator'],
  ['I4','John Fitzgerald KENNEDY','M','29 MAY 1917','22 NOV 1963','Brookline, MA','Dallas, TX','35th President of the United States'],
  ['I5','Rosemary KENNEDY','F','13 SEP 1918','7 JAN 2005','Brookline, MA','Fort Atkinson, WI',''],
  ['I6','Kathleen KENNEDY','F','20 FEB 1920','13 MAY 1948','Brookline, MA','Ste-Bauzille, France',''],
  ['I7','Eunice Mary KENNEDY','F','10 JUL 1921','11 AUG 2009','Brookline, MA','Hyannis, MA','Founder of Camp Shriver'],
  ['I8','Robert Sargent SHRIVER Jr.','M','9 NOV 1915','18 JAN 2011','Westminster, MD','Bethesda, MD',''],
  ['I9','Patricia Helen KENNEDY','F','6 MAY 1924','17 SEP 2006','Brookline, MA','Manhattan, NY',''],
  ['I10','Robert Francis KENNEDY','M','20 NOV 1925','6 JUN 1968','Brookline, MA','Los Angeles, CA','U.S. Senator and Attorney General'],
  ['I11','Jean Ann KENNEDY','F','20 FEB 1928','','Boston, MA','','Diplomat'],
  ['I12','Edward Moore KENNEDY','M','22 FEB 1932','25 AUG 2009','Dorchester, MA','Hyannis Port, MA','U.S. Senator'],
  ['I13','Virginia Joan BENNETT','F','2 SEP 1936','','Riverdale, NY','',''],
  ['I14','Maria Owings SHRIVER','F','6 NOV 1955','','Chicago, IL','','Journalist'],
  ['I15','Arnold Alois SCHWARZENEGGER','M','30 JUL 1947','','Thal, Austria','','Governor of California, 2003–2011'],
  ['I16','John Fitzgerald KENNEDY Jr.','M','25 NOV 1960','16 JUL 1999','Washington, DC','','Lawyer and publisher'],
  ['I17','Jacqueline Lee BOUVIER','F','28 JUL 1929','19 MAY 1994','East Hampton, NY','New York, NY','Editor and First Lady'],
  ['I18','Caroline Bouvier KENNEDY','F','27 NOV 1957','','New York, NY','','Diplomat and author'],
  ['I19','Patrick Bouvier KENNEDY','M','7 AUG 1963','9 AUG 1963','Falmouth, MA','Boston, MA',''],
  ['I20','Victoria Anne REGGIE','F','26 FEB 1954','','Crowley, LA','','Washington lawyer'],
  ['I21','Patrick KENNEDY','M','ABT 1823','22 NOV 1858','Dunganstown, Ireland','Boston, MA','Cooper, Ward Boss'],
  ['I22','Bridget MURPHY','F','1821','20 DEC 1888','Dunganstown, Ireland','Boston, MA','Shopkeeper'],
  ['I23','Patrick Joseph KENNEDY','M','14 JAN 1858','18 MAY 1929','East Boston, MA','Boston, MA','Dockhand, Saloonkeeper, Senator, Bank President'],
  ['I24','Mary Augusta HICKEY','F','6 DEC 1857','20 MAY 1923','Winthrop, MA','Boston, MA',''],
  ['I25','John Francis FITZGERALD','M','11 FEB 1863','3 OCT 1950','Boston, MA','Boston, MA','Mayor of Boston'],
  ['I26','Mary Josephine HANNON','F','31 OCT 1865','8 AUG 1964','Acton, MA','Dorchester, MA',''],
  ['I27','John Vernou BOUVIER III','M','19 MAY 1891','2 AUG 1957','Easthampton, MA','','Stockbroker'],
  ['I28','Janet Norton LEE','F','3 DEC 1907','22 JUL 1989','','Newport, RI',''],
  ['I29','Edwin Arthur SCHLOSSBERG','M','19 JUL 1945','','','','Designer and artist'],
  ['I30','William John Robert CAVENDISH','M','10 DEC 1917','10 SEP 1944','','Heppen, Belgium','Politician and soldier'],
  ['I31','Rose Kennedy SCHLOSSBERG','F','25 JUN 1988','','','',''],
  ['I32','Tatiana Celia Kennedy SCHLOSSBERG','F','1989','','','','Journalist'],
  ['I33','John Bouvier Kennedy SCHLOSSBERG','M','19 JAN 1993','','New York, NY','','Lawyer'],
  ['I34','Carolyn BESSETTE','F','7 JAN 1966','16 JUL 1999','White Plains, NY','','Fashion industry publicist'],
  ['I35','Aristotle ONASSIS','M','15 JAN 1906','15 MAR 1975','Smyrna, Ottoman Empire','Neuilly-sur-Seine, France','Shipping magnate'],
  ['I36','Timothy Perry SHRIVER','M','29 AUG 1959','','Boston, MA','','Chairman of Special Olympics'],
  ['I37','Mark Kennedy SHRIVER','M','17 FEB 1964','','Washington, DC','','American Democratic politician'],
  ['I38','Robert Sargent SHRIVER III','M','28 APR 1954','','Chicago, IL','','Attorney and activist'],
  ['I39','Anthony Paul Kennedy SHRIVER','M','20 JUL 1965','','Boston, MA','','Activist'],
  ['I40','Robert Sargent SHRIVER','M','12 JAN 1878','12 JUN 1942','','',''],
  ['I41','Hilda SHRIVER','F','2 NOV 1882','18 AUG 1977','','',''],
  ['I42','Francis Benedict KENNEDY','F','11 MAR 1891','14 JUN 1892','East Boston, MA','East Boston, MA',''],
  ['I43','Mary Loretta KENNEDY','F','6 AUG 1892','18 NOV 1972','East Boston, MA','Winfield, IL',''],
  ['I45','Gustav SCHWARZENEGGER','M','1907','1972','','',''],
  ['I46','Aurelia JADRNY','F','1922','1998','','',''],
  ['I47','Katherine Eunice SCHWARZENEGGER','F','13 DEC 1989','','Los Angeles, CA','','Author'],
  ['I48','Christina Maria Aurelia SCHWARZENEGGER','F','23 JUL 1991','','Los Angeles, CA','','Producer'],
  ['I49','Patrick Arnold Shriver SCHWARZENEGGER','M','18 SEP 1993','','Los Angeles, CA','','Actor'],
  ['I50','Christopher Sargent Shriver SCHWARZENEGGER','M','27 SEP 1997','','Los Angeles, CA','','']
];

const families = [
  ['F1',['I1','I2'],['I3','I4','I5','I6','I7','I9','I10','I11','I12'],'7 OCT 1914'],
  ['F2',['I30','I6'],[],'6 MAY 1944'],
  ['F3',['I8','I7'],['I38','I14','I36','I37','I39'],'23 MAY 1953'],
  ['F6',['I12','I13'],[],'30 NOV 1958',{ divorce: '6 DEC 1982' }],
  ['F7',['I15','I14'],['I47','I48','I49','I50'],'26 APR 1986',{ separation: '9 MAY 2011' }],
  ['F8',['I4','I17'],['I18','I16','I19'],'12 SEP 1953'],
  ['F9',['I35','I17'],[],'22 OCT 1968'],
  ['F10',['I29','I18'],['I31','I32','I33'],'19 JUL 1986'],
  ['F12',['I21','I22'],['I23'],'28 SEP 1849'],
  ['F13',['I23','I24'],['I1','I42','I43'],'ABT 1887'],
  ['F14',['I25','I26'],['I2'],'18 SEP 1889'],
  ['F15',['I27','I28'],['I17'],'7 JUL 1928',{ divorce: '1940' }],
  ['F17',['I12','I20'],[],'3 JUL 1992'],
  ['F20',['I16','I34'],[],'21 SEP 1996'],
  ['F28',['I40','I41'],['I8'],''],
  ['F32',['I45','I46'],['I15'],'']
].map(([id,partners,children,marriage,events = {}]) => ({
  id,
  partners,
  children,
  marriage,
  divorce: '',
  separation: '',
  annulment: '',
  ...events
}));

const sampleSources = {
  S1: {
    id: 'S1', type: 'Book', title: 'The Kennedys, A Chronological History', periodical: '',
    publisher: 'Ballantine Books', author: 'Harvey Rachlin', date: '', text: '', url: '',
    repository: '', place: '', media: ''
  },
  S6: {
    id: 'S6', type: 'Book', title: 'The Fitzgeralds and the Kennedys, An American Saga', periodical: '',
    publisher: 'Simon and Schuster', author: 'Doris Kearns Goodwin', date: '1987', text: '', url: '',
    repository: '', place: '', media: ''
  },
  S7: {
    id: 'S7', type: 'Book', title: 'The Kennedys, Dynasty and Disaster 1848-1983', periodical: '',
    publisher: '', author: 'John H. Davis', date: '', text: '', url: '', repository: '', place: '', media: ''
  }
};

const cite = (id, page = '') => ({ id, page, record: sampleSources[id] });
const fact = (tag, label, date, place, note = '', sources = [], value = '') => ({
  tag, label, value, date, place,
  notes: note ? [{ text: note, sources: [] }] : [],
  sources
});

const sampleDetails = {
  I4: {
    aliases: [],
    suffix: '',
    titles: [],
    facts: [
      fact('BIRT', 'Birth', '29 MAY 1917', 'Brookline, MA', 'Born at the family home at 83 Beals Street.', [cite('S1', 'page 46')]),
      fact('BAPM', 'Baptism', '19 JUN 1917', 'Brookline, MA', "Baptized at St. Aidan's Catholic Church.", [cite('S1', 'page 46')]),
      fact('GRAD', 'Graduation', '8 JUN 1935', 'Wallingford, CT', 'Graduated from Choate School.', [cite('S1', 'page 58')]),
      fact('EDUC', 'Education', '26 OCT 1935', 'Princeton, NJ', 'Enrolled at Princeton University.', [cite('S1', 'page 66')]),
      fact('EDUC', 'Education', '28 SEP 1936', 'Cambridge, MA', 'Entered Harvard University.', [cite('S1', 'page 67')]),
      fact('GRAD', 'Graduation', '20 JUN 1940', 'Cambridge, MA', 'Graduated cum laude from Harvard.'),
      fact('EDUC', 'Education', '14 MAR 1940', 'Palo Alto, CA', 'Enrolled in graduate classes at Stanford University.', [cite('S1', 'page 80')]),
      fact('ELEC', 'Election', '5 NOV 1946', 'Boston, MA', 'Elected to the U.S. House of Representatives.', [cite('S1', 'page 103')]),
      fact('ELEC', 'Election', '4 NOV 1952', 'New Milford, CT', 'Elected U.S. Senator for Massachusetts.', [cite('S1', 'page 121')]),
      fact('ELEC', 'Election', '8 NOV 1960', 'Wallingford, CT', 'Elected President of the United States.', [cite('S1', 'page 174')]),
      fact('DEAT', 'Death', '22 NOV 1963', 'Dallas, TX', 'Assassinated while riding in a motorcade in downtown Dallas.', [cite('S1', 'pages 281–282')]),
      fact('BURI', 'Burial', '25 NOV 1963', 'Arlington, VA', '', [cite('S1', 'page 283')]),
      fact('OCCU', 'Occupation', '', '', '', [], '35th President of the United States')
    ],
    notes: [{
      text: 'Wrote two books, including Profiles in Courage, which won him a Pulitzer Prize.',
      sources: [cite('S7')]
    }],
    sources: [cite('S6', 'page 274'), cite('S1', 'page 46')],
    media: [
      { file: 'jfk, white house portrait.jpg', format: 'image/jpg', title: 'White House portrait', type: 'PHOTO', primary: true, note: '' },
      { file: 'jfk, campaign poster.jpg', format: 'image/jpg', title: 'Campaign poster', type: 'PHOTO', primary: false, note: '' },
      { file: 'jfk 1947.jpg', format: 'image/jpg', title: 'John F. Kennedy, 1947', type: 'PHOTO', primary: false, note: '' }
    ],
    record: { uid: 'F6E43CDCFCE1443EB47C87707C8EAC0533D6', changed: '22 SEP 2017' }
  }
};

export const sampleGraph = {
  people: Object.fromEntries(rows.map(([id,name,sex,birth,death,birthPlace,deathPlace,occupation]) => [id, {
    id, name, sex, birth, death, birthPlace, deathPlace, occupation,
    ...(sampleDetails[id] ?? {})
  }])),
  families,
  sources: sampleSources
};
