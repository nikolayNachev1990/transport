exports.seed = async function (knex) {
  const table = "time_zones";
  const seeds = [
    { id: "1", zone: "UTC-12:00", text: "International Date Line West" },
    { id: "2", zone: "UTC-11:00", text: "Niue Time" },
    { id: "3", zone: "UTC-11:00", text: "Samoa Standard TIme" },
    { id: "4", zone: "UTC-10:00", text: "Cook Islands Standard Time" },
    { id: "5", zone: "UTC-10:00", text: "Hawaii-Aleutian Standard Time" },
    { id: "6", zone: "UTC-10:00", text: "Tahiti Time" },
    { id: "7", zone: "UTC-09:30", text: "Marquesas Time" },
    { id: "8", zone: "UTC-09:00", text: "Gambier Time" },
    { id: "9", zone: "UTC-09:00", text: "Hawaii-Aleutian Time (Adak)" },
    { id: "10", zone: "UTC-08:00", text: "Alaska Time - Anchorage" },
    { id: "11", zone: "UTC-08:00", text: "Alaska Time - Juneau" },
    { id: "12", zone: "UTC-08:00", text: "Alaska Time - Metlakatla" },
    { id: "13", zone: "UTC-08:00", text: "Alaska Time - Nome" },
    { id: "14", zone: "UTC-08:00", text: "Alaska Time - Sitka" },
    { id: "15", zone: "UTC-08:00", text: "Alaska Time - Yakutat" },
    { id: "16", zone: "UTC-08:00", text: "Pitcairn Time" },
    {
      id: "17",
      zone: "UTC-07:00",
      text: "Mexican Pacific Standard Time - Hermosillo",
    },
    {
      id: "18",
      zone: "UTC-07:00",
      text: "Mexican Pacific Standard Time - Mazaltan",
    },
    {
      id: "19",
      zone: "UTC-07:00",
      text: "Mountain Standard Time - Dawson Creek",
    },
    {
      id: "20",
      zone: "UTC-07:00",
      text: "Mountain Standard Time - Fort Nelson",
    },
    {
      id: "21",
      zone: "UTC-07:00",
      text: "Mountain Standard Time - Phoenix",
    },
    {
      id: "22",
      zone: "UTC-07:00",
      text: "Pacific Time - Los Angeles",
    },
    {
      id: "23",
      zone: "UTC-07:00",
      text: "Pacific Time - Tijuana",
    },
    {
      id: "24",
      zone: "UTC-07:00",
      text: "Pacific Time - Vancouver",
    },
    {
      id: "25",
      zone: "UTC-07:00",
      text: "Yukon Time - Dawson",
    },
    {
      id: "26",
      zone: "UTC-07:00",
      text: "Yukon Time - Whitehorse",
    },
    {
      id: "27",
      zone: "UTC-06:00",
      text: "Central Standard Time - Bahia de Banderas",
    },
    {
      id: "28",
      zone: "UTC-06:00",
      text: "Central Standard Time - Belize",
    },
    {
      id: "29",
      zone: "UTC-06:00",
      text: "Central Standard Time - Chihuahua",
    },
    {
      id: "30",
      zone: "UTC-06:00",
      text: "Central Standard Time - Costa Rica",
    },
    {
      id: "31",
      zone: "UTC-06:00",
      text: "Central Standard Time - El Salvador",
    },
    {
      id: "32",
      zone: "UTC-06:00",
      text: "Central Standard Time - Guatemala",
    },
    {
      id: "33",
      zone: "UTC-06:00",
      text: "Central Standard Time - Managua",
    },
    {
      id: "34",
      zone: "UTC-06:00",
      text: "Central Standard Time - Merida",
    },
    {
      id: "35",
      zone: "UTC-06:00",
      text: "Central Standard Time - Mexico City",
    },
    {
      id: "36",
      zone: "UTC-06:00",
      text: "Central Standard Time - Monterey",
    },
    {
      id: "37",
      zone: "UTC-06:00",
      text: "Central Standard Time - Regina",
    },
    {
      id: "38",
      zone: "UTC-06:00",
      text: "Central Standard Time - Swift Current",
    },
    {
      id: "39",
      zone: "UTC-06:00",
      text: "Central Standard Time - Tegucigalpa",
    },
    {
      id: "40",
      zone: "UTC-06:00",
      text: "Galapagos time",
    },
    {
      id: "41",
      zone: "UTC-06:00",
      text: "Mountain Time - Boise",
    },
    {
      id: "42",
      zone: "UTC-06:00",
      text: "Mountain Time - Cambridge Bay",
    },
    {
      id: "43",
      zone: "UTC-06:00",
      text: "Mountain Time - Cuidad Juarez",
    },
    {
      id: "44",
      zone: "UTC-06:00",
      text: "Mountain Time - Denver",
    },
    {
      id: "45",
      zone: "UTC-06:00",
      text: "Mountain Time - Edmonton",
    },
    {
      id: "46",
      zone: "UTC-06:00",
      text: "Mountain Time - Inuvik",
    },
    {
      id: "47",
      zone: "UTC-06:00",
      text: "Mountain Time - Yellowknife",
    },

    {
      id: "48",
      zone: "UTC-05:00",
      text: "Acre Standard Time - Eirunepe",
    },
    {
      id: "49",
      zone: "UTC-05:00",
      text: "Acre Standard Time - Rio Branco",
    },
    {
      id: "50",
      zone: "UTC-05:00",
      text: "Central Time - Beulah, North Dakota",
    },
    {
      id: "51",
      zone: "UTC-05:00",
      text: "Central Time - Center, North Dakota",
    },
    {
      id: "52",
      zone: "UTC-05:00",
      text: "Central Time - Chicago",
    },
    {
      id: "53",
      zone: "UTC-05:00",
      text: "Central Time - Knox, Indiana",
    },
    {
      id: "54",
      zone: "UTC-05:00",
      text: "Central Time - Matamoros",
    },
    {
      id: "55",
      zone: "UTC-05:00",
      text: "Central Time - Menominee",
    },
    {
      id: "56",
      zone: "UTC-05:00",
      text: "Central Time - New Salem, North Dakota",
    },
    {
      id: "57",
      zone: "UTC-05:00",
      text: "Central Time - Ojinaga",
    },
    {
      id: "58",
      zone: "UTC-05:00",
      text: "Central Time - Rainy River",
    },
    {
      id: "59",
      zone: "UTC-05:00",
      text: "Central Time - Rankin Inlet",
    },
    {
      id: "60",
      zone: "UTC-05:00",
      text: "Central Time - Resolute",
    },
    {
      id: "61",
      zone: "UTC-05:00",
      text: "Central Time - Tell City, Indiana",
    },
    {
      id: "62",
      zone: "UTC-05:00",
      text: "Central Time - Winnipeg",
    },
    {
      id: "63",
      zone: "UTC-05:00",
      text: "Columbia Standard Time",
    },
    {
      id: "64",
      zone: "UTC-05:00",
      text: "Easter Island Time",
    },
    {
      id: "65",
      zone: "UTC-05:00",
      text: "Eastern Standard Time - Cancun",
    },
    {
      id: "66",
      zone: "UTC-05:00",
      text: "Eastern Standard Time - Jamaica",
    },
    {
      id: "67",
      zone: "UTC-05:00",
      text: "Eastern Standard Time - Panama",
    },
    {
      id: "68",
      zone: "UTC-05:00",
      text: "Ecuador Time",
    },
    {
      id: "69",
      zone: "UTC-05:00",
      text: "Peru Standard Time",
    },
    {
      id: "70",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Boa Vista",
    },
    {
      id: "71",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Campo Grande",
    },
    {
      id: "72",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Cuiaba",
    },
    {
      id: "73",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Manaus",
    },
    {
      id: "74",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Porto Velho",
    },
    {
      id: "75",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Barbados",
    },
    {
      id: "76",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Martinque",
    },
    {
      id: "77",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Puerto Rico",
    },
    {
      id: "78",
      zone: "UTC-04:00",
      text: "Amazon Standard Time - Santo Domingo",
    },
    {
      id: "79",
      zone: "UTC-04:00",
      text: "Bolivia Time",
    },
    {
      id: "80",
      zone: "UTC-04:00",
      text: "Cuba Time",
    },
    {
      id: "81",
      zone: "UTC-04:00",
      text: "Eastern Time - Detroit",
    },
    {
      id: "82",
      zone: "UTC-04:00",
      text: "Eastern Time - Grand Turk",
    },
    {
      id: "83",
      zone: "UTC-04:00",
      text: "Eastern Time - Indianapolis",
    },
    {
      id: "84",
      zone: "UTC-04:00",
      text: "Eastern Time - Iqaluit",
    },
    {
      id: "85",
      zone: "UTC-04:00",
      text: "Eastern Time - Louisville",
    },
    {
      id: "86",
      zone: "UTC-04:00",
      text: "Eastern Time - Marengo, Indiana",
    },
    {
      id: "87",
      zone: "UTC-04:00",
      text: "Eastern Time - New York",
    },
    {
      id: "88",
      zone: "UTC-04:00",
      text: "Eastern Time - Nipigon",
    },
    {
      id: "89",
      zone: "UTC-04:00",
      text: "Eastern Time - Pangnirtung",
    },
    {
      id: "90",
      zone: "UTC-04:00",
      text: "Eastern Time - Petersburg, Indiana",
    },
    {
      id: "91",
      zone: "UTC-04:00",
      text: "Eastern Time - Port-au-Prince",
    },
    {
      id: "92",
      zone: "UTC-04:00",
      text: "Eastern Time - Thunder Bay",
    },
    {
      id: "93",
      zone: "UTC-04:00",
      text: "Eastern Time - Torontoa",
    },
    {
      id: "94",
      zone: "UTC-04:00",
      text: "Eastern Time - Vevay, Indiana",
    },
    {
      id: "95",
      zone: "UTC-04:00",
      text: "Eastern Time - Vincennes, Indiana",
    },
    {
      id: "96",
      zone: "UTC-04:00",
      text: "Eastern Time - Winamac, Indiana",
    },
    {
      id: "97",
      zone: "UTC-04:00",
      text: "Guyana Time",
    },
    {
      id: "98",
      zone: "UTC-04:00",
      text: "Venezuela Time",
    },
    {
      id: "99",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Buenos Aires",
    },
    {
      id: "100",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Catamarca",
    },
    {
      id: "101",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Cordoba",
    },
    {
      id: "102",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Jujuy",
    },
    {
      id: "103",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - La Rioja",
    },
    {
      id: "104",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Mendoza",
    },
    {
      id: "105",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Rio Gallegos",
    },
    {
      id: "106",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Salta",
    },
    {
      id: "107",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - San Juan",
    },
    {
      id: "108",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - San Luis",
    },
    {
      id: "109",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Tucuman",
    },
    {
      id: "110",
      zone: "UTC-03:00",
      text: "Argentina Standard Time - Ushuaia",
    },
    {
      id: "111",
      zone: "UTC-03:00",
      text: "Atlantic Time - Bermuda",
    },
    {
      id: "112",
      zone: "UTC-03:00",
      text: "Atlantic Time - Glace Bay",
    },
    {
      id: "113",
      zone: "UTC-03:00",
      text: "Atlantic Time - Goose Bay",
    },
    {
      id: "114",
      zone: "UTC-03:00",
      text: "Atlantic Time - Halifax",
    },
    {
      id: "115",
      zone: "UTC-03:00",
      text: "Atlantic Time - Moncton",
    },
    {
      id: "116",
      zone: "UTC-03:00",
      text: "Atlantic Time - Thule",
    },
    {
      id: "117",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Araguaina",
    },
    {
      id: "118",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Bahia",
    },
    {
      id: "119",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Belem",
    },
    {
      id: "120",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Fortaleza",
    },
    {
      id: "121",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Maceio",
    },
    {
      id: "122",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Recife",
    },
    {
      id: "123",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Santarem",
    },
    {
      id: "124",
      zone: "UTC-03:00",
      text: "Brasilia Standard Time - Sao Paolo",
    },
    {
      id: "125",
      zone: "UTC-03:00",
      text: "Chile Time",
    },
    {
      id: "126",
      zone: "UTC-03:00",
      text: "Falkland Islands Standard Time",
    },
    {
      id: "127",
      zone: "UTC-03:00",
      text: "French Guiana Time",
    },
    {
      id: "128",
      zone: "UTC-03:00",
      text: "Palmer Time",
    },
    {
      id: "129",
      zone: "UTC-03:00",
      text: "Paraguay Time",
    },
    {
      id: "130",
      zone: "UTC-03:00",
      text: "Punta Arenas Time",
    },
    {
      id: "131",
      zone: "UTC-03:00",
      text: "Rothera Time",
    },
    {
      id: "132",
      zone: "UTC-03:00",
      text: "Suriname Time",
    },
    {
      id: "133",
      zone: "UTC-03:00",
      text: "Uruguay Standard Time",
    },
    { id: "134", zone: "UTC-02:30", text: "Newfoundland Time" },
    { id: "135", zone: "UTC-02:00", text: "Fernando de Noronha Standard Time" },
    { id: "136", zone: "UTC-02:00", text: "South Georgia Time" },
    { id: "137", zone: "UTC-02:00", text: "St. Pierre & Mequelon Time" },
    { id: "138", zone: "UTC-02:00", text: "West Greenland Time" },
    { id: "139", zone: "UTC-01:00", text: "Azores Time" },
    { id: "140", zone: "UTC-01:00", text: "Cape Verde Standard Time" },
    { id: "141", zone: "UTC-01:00", text: "East Greenland Time" },
    {
      id: "142",
      zone: "UTC+00:00",
      text: "Coordinated Universal Time",
    },
    {
      id: "143",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time",
    },
    {
      id: "144",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time - Abidjan",
    },
    {
      id: "145",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time - Bissau",
    },
    {
      id: "146",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time - Danmarkshavn",
    },
    {
      id: "147",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time - Monrovia",
    },
    {
      id: "148",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time - Reykjavik",
    },
    {
      id: "149",
      zone: "UTC+00:00",
      text: "Greenwich Mean Time - Sao Tome",
    },
    {
      id: "150",
      zone: "UTC+00:00",
      text: "Ireland Time",
    },
    {
      id: "151",
      zone: "UTC+00:00",
      text: "Troll Time",
    },
    {
      id: "152",
      zone: "UTC+00:00",
      text: "United Kingdom Time",
    },
    {
      id: "153",
      zone: "UTC+00:00",
      text: "Western European Time - Canary",
    },
    {
      id: "154",
      zone: "UTC+00:00",
      text: "Western European Time - Faroe",
    },
    {
      id: "155",
      zone: "UTC+00:00",
      text: "Western European Time - Lisbon",
    },
    {
      id: "156",
      zone: "UTC+00:00",
      text: "Western European Time - Madeira",
    },
    {
      id: "157",
      zone: "UTC+01:00",
      text: "Central European Standard Time - Algiers",
    },
    {
      id: "158",
      zone: "UTC+01:00",
      text: "Central European Standard Time - Tunis",
    },
    {
      id: "159",
      zone: "UTC+01:00",
      text: "Central European Time - Amsterdam",
    },
    {
      id: "160",
      zone: "UTC+01:00",
      text: "Central European Time - Andora",
    },
    {
      id: "161",
      zone: "UTC+01:00",
      text: "Central European Time - Belgrade",
    },
    {
      id: "162",
      zone: "UTC+01:00",
      text: "Central European Time - Berlin",
    },
    {
      id: "163",
      zone: "UTC+01:00",
      text: "Central European Time - Brussel",
    },
    {
      id: "164",
      zone: "UTC+01:00",
      text: "Central European Time - Budapest",
    },
    {
      id: "165",
      zone: "UTC+01:00",
      text: "Central European Time - Ceuta",
    },
    {
      id: "166",
      zone: "UTC+01:00",
      text: "Central European Time - Copenhagen",
    },
    {
      id: "167",
      zone: "UTC+01:00",
      text: "Central European Time - Gibraltar",
    },
    {
      id: "168",
      zone: "UTC+01:00",
      text: "Central European Time - Luxemburg",
    },
    {
      id: "169",
      zone: "UTC+01:00",
      text: "Central European Time - Madrid",
    },
    {
      id: "170",
      zone: "UTC+01:00",
      text: "Central European Time - Malta",
    },
    {
      id: "171",
      zone: "UTC+01:00",
      text: "Central European Time - Monako",
    },
    {
      id: "172",
      zone: "UTC+01:00",
      text: "Central European Time - Oslo",
    },
    {
      id: "173",
      zone: "UTC+01:00",
      text: "Central European Time - Paris",
    },
    {
      id: "174",
      zone: "UTC+01:00",
      text: "Central European Time - Prague",
    },
    {
      id: "175",
      zone: "UTC+01:00",
      text: "Central European Time - Rome",
    },
    {
      id: "176",
      zone: "UTC+01:00",
      text: "Central European Time - Stockholm",
    },
    {
      id: "177",
      zone: "UTC+01:00",
      text: "Central European Time - Tirane",
    },
    {
      id: "178",
      zone: "UTC+01:00",
      text: "Central European Time - Vienna",
    },
    {
      id: "179",
      zone: "UTC+01:00",
      text: "Central European Time - Warsaw",
    },
    {
      id: "180",
      zone: "UTC+01:00",
      text: "Central European Time - Zurich",
    },
    {
      id: "181",
      zone: "UTC+01:00",
      text: "Marocco Time",
    },
    {
      id: "182",
      zone: "UTC+01:00",
      text: "West Africa Standard Time - Lagos",
    },
    {
      id: "183",
      zone: "UTC+01:00",
      text: "West Africa Standard Time - Ndjamena",
    },
    {
      id: "184",
      zone: "UTC+01:00",
      text: "Western Sahara Time",
    },
    {
      id: "185",
      zone: "UTC+02:00",
      text: "Central Africa Time - Juba",
    },
    {
      id: "186",
      zone: "UTC+02:00",
      text: "Central Africa Time - Khartoum",
    },
    {
      id: "187",
      zone: "UTC+02:00",
      text: "Central Africa Time - Maputo",
    },
    {
      id: "188",
      zone: "UTC+02:00",
      text: "Central Africa Time - Windhoek",
    },
    {
      id: "189",
      zone: "UTC+02:00",
      text: "Eastern European Standard Time - Kaliningrad",
    },
    {
      id: "190",
      zone: "UTC+02:00",
      text: "Eastern European Standard Time - Tripoli",
    },
    {
      id: "191",
      zone: "UTC+02:00",
      text: "Eastern European Time",
    },
    {
      id: "192",
      zone: "UTC+02:00",
      text: "Eastern European Time - Athens",
    },
    {
      id: "193",
      zone: "UTC+02:00",
      text: "Eastern European Time - Beirut",
    },
    {
      id: "194",
      zone: "UTC+02:00",
      text: "Eastern European Time - Bucharest",
    },
    {
      id: "195",
      zone: "UTC+02:00",
      text: "Eastern European Time - Chisinau",
    },
    {
      id: "196",
      zone: "UTC+02:00",
      text: "Eastern European Time - Gaza",
    },
    {
      id: "197",
      zone: "UTC+02:00",
      text: "Eastern European Time - Hebron",
    },
    {
      id: "198",
      zone: "UTC+02:00",
      text: "Eastern European Time - Helzinki",
    },
    {
      id: "199",
      zone: "UTC+02:00",
      text: "Eastern European Time - Kyiv",
    },
    {
      id: "200",
      zone: "UTC+02:00",
      text: "Eastern European Time - Nicosia",
    },
    {
      id: "201",
      zone: "UTC+02:00",
      text: "Eastern European Time - Riga",
    },
    {
      id: "202",
      zone: "UTC+02:00",
      text: "Eastern European Time - Sofia",
    },
    {
      id: "203",
      zone: "UTC+02:00",
      text: "Eastern European Time - Tallinn",
    },
    {
      id: "204",
      zone: "UTC+02:00",
      text: "Eastern European Time - Uzhhorod",
    },
    {
      id: "205",
      zone: "UTC+02:00",
      text: "Eastern European Time - Vilnius",
    },
    {
      id: "206",
      zone: "UTC+02:00",
      text: "Eastern European Time - Zaporozhye",
    },
    {
      id: "207",
      zone: "UTC+02:00",
      text: "Famagusta Time",
    },
    {
      id: "208",
      zone: "UTC+02:00",
      text: "Israel Time",
    },
    {
      id: "209",
      zone: "UTC+02:00",
      text: "South Africa Standard Time",
    },
    {
      id: "210",
      zone: "UTC+03:00",
      text: "Arab Standard Time - Baghdad",
    },
    {
      id: "211",
      zone: "UTC+03:00",
      text: "Arab Standard Time - Qatar",
    },
    {
      id: "212",
      zone: "UTC+03:00",
      text: "Arab Standard Time - Riyadh",
    },
    {
      id: "213",
      zone: "UTC+03:00",
      text: "East Africa Time",
    },
    {
      id: "214",
      zone: "UTC+03:00",
      text: "Jordan Time",
    },
    {
      id: "215",
      zone: "UTC+03:00",
      text: "Kirov Time",
    },
    {
      id: "216",
      zone: "UTC+03:00",
      text: "Moscow Standard Time - Minsk",
    },
    {
      id: "217",
      zone: "UTC+03:00",
      text: "Moscow Standard Time - Moscow",
    },
    {
      id: "218",
      zone: "UTC+03:00",
      text: "Moscow Standard Time - Simferopol",
    },
    {
      id: "219",
      zone: "UTC+03:00",
      text: "Syria Time",
    },
    {
      id: "220",
      zone: "UTC+03:00",
      text: "Turkiye Time",
    },
    {
      id: "221",
      zone: "UTC+03:00",
      text: "Volgograd Standard Time",
    },
    { id: "222", zone: "UTC+03:30", text: "Iran Standard Time" },
    { id: "223", zone: "UTC+04:00", text: "Armenia Standard Time" },
    { id: "224", zone: "UTC+04:00", text: "Astrakhan Time" },
    { id: "225", zone: "UTC+04:00", text: "Azerbaijan Standard Time" },
    { id: "226", zone: "UTC+04:00", text: "Georgia Standard Time" },
    { id: "227", zone: "UTC+04:00", text: "Gulf Standard Time" },
    { id: "228", zone: "UTC+04:00", text: "Mauritius Standard Time" },
    { id: "229", zone: "UTC+04:00", text: "Reunion Time" },
    { id: "230", zone: "UTC+04:00", text: "Samara Standard Time" },
    { id: "231", zone: "UTC+04:00", text: "Seratov Time" },
    { id: "232", zone: "UTC+04:00", text: "Seychelles Time" },
    { id: "233", zone: "UTC+04:00", text: "Ulyanovsk Time" },
    { id: "234", zone: "UTC+04:30", text: "Afghanistan Time" },
    { id: "235", zone: "UTC+05:00", text: "French Southern & Antarctic Time" },
    { id: "236", zone: "UTC+05:00", text: "Maldives Time" },
    { id: "237", zone: "UTC+05:00", text: "Mawson Time" },
    { id: "238", zone: "UTC+05:00", text: "Pakistan Standard Time" },
    { id: "239", zone: "UTC+05:00", text: "Tajikistan Time" },
    { id: "240", zone: "UTC+05:00", text: "Turkmenistan Standard Time" },
    {
      id: "241",
      zone: "UTC+05:00",
      text: "Uzbekistan Standard Time - Samarkand",
    },
    {
      id: "242",
      zone: "UTC+05:00",
      text: "Uzbekistan Standard Time - Tashkent",
    },
    { id: "243", zone: "UTC+05:00", text: "West Kazakhstan Time - Aqtau" },
    { id: "244", zone: "UTC+05:00", text: "West Kazakhstan Time - Aqtobe" },
    { id: "245", zone: "UTC+05:00", text: "West Kazakhstan Time - Atyrau" },
    { id: "246", zone: "UTC+05:00", text: "West Kazakhstan Time - Oral" },
    { id: "247", zone: "UTC+05:00", text: "West Kazakhstan Time - Qyzylorda" },
    { id: "248", zone: "UTC+05:00", text: "Yekaterinburg Standard Time" },
    {
      id: "249",
      zone: "UTC+05:30",
      text: "India Standard Time - Colombo",
    },
    {
      id: "250",
      zone: "UTC+05:30",
      text: "India Standard Time - Kolkata",
    },
    { id: "251", zone: "UTC+05:45", text: "Nepal Time" },
    { id: "252", zone: "UTC+06:00", text: "Bangladesh Standard Time" },
    { id: "253", zone: "UTC+06:00", text: "Bhutan Time" },
    { id: "254", zone: "UTC+06:00", text: "East Kazakhstan Time - Almaty" },
    { id: "255", zone: "UTC+06:00", text: "East Kazakhstan Time - Kostanay" },
    { id: "256", zone: "UTC+06:00", text: "India Ocean Time" },
    { id: "257", zone: "UTC+06:00", text: "Kyrgyzstan Time" },
    { id: "258", zone: "UTC+06:00", text: "Omsk Standard Time" },
    { id: "259", zone: "UTC+06:00", text: "Urumqi Time" },
    { id: "260", zone: "UTC+06:00", text: "Vostok Time" },
    { id: "261", zone: "UTC+06:30", text: "Cocos Island Time" },
    { id: "262", zone: "UTC+06:30", text: "Myanmar Time" },
    {
      id: "263",
      zone: "UTC+07:00",
      text: "Barnaul Time",
    },
    {
      id: "264",
      zone: "UTC+07:00",
      text: "Christmas Island Time",
    },
    {
      id: "265",
      zone: "UTC+07:00",
      text: "Davis Time",
    },
    {
      id: "266",
      zone: "UTC+07:00",
      text: "Hovd Standard Time",
    },
    {
      id: "267",
      zone: "UTC+07:00",
      text: "Indochina Time - Bangkok",
    },
    {
      id: "268",
      zone: "UTC+07:00",
      text: "Indochina Time - Ho Chi Minh City",
    },
    {
      id: "269",
      zone: "UTC+07:00",
      text: "Krasnoyarsk Standard Time - Krasnoyarsk",
    },
    {
      id: "270",
      zone: "UTC+07:00",
      text: "Krasnoyarsk Standard Time - Novokuznetsk",
    },
    {
      id: "271",
      zone: "UTC+07:00",
      text: "Novosibirsk Standard Time",
    },
    {
      id: "272",
      zone: "UTC+07:00",
      text: "Tomsk Time",
    },
    {
      id: "273",
      zone: "UTC+07:00",
      text: "Western Indonesia Time - Jakarta",
    },
    {
      id: "274",
      zone: "UTC+07:00",
      text: "Western Indonesia Time - Pontianak",
    },
    {
      id: "275",
      zone: "UTC+08:00",
      text: "Australian Western Standard Time",
    },
    {
      id: "276",
      zone: "UTC+08:00",
      text: "Brunei Durussalam Time",
    },
    {
      id: "277",
      zone: "UTC+08:00",
      text: "Central Indonesia Time",
    },
    {
      id: "278",
      zone: "UTC+08:00",
      text: "China Standard Time - Macao",
    },
    {
      id: "279",
      zone: "UTC+08:00",
      text: "China Standard Time - Shanghai",
    },
    {
      id: "280",
      zone: "UTC+08:00",
      text: "Hong Kong Standard Time",
    },
    {
      id: "281",
      zone: "UTC+08:00",
      text: "Irkutsk Standard Time",
    },
    {
      id: "282",
      zone: "UTC+08:00",
      text: "Malaysia Time - Kuala Lumpur",
    },
    {
      id: "283",
      zone: "UTC+08:00",
      text: "Malaysia Time - Kuching",
    },
    {
      id: "284",
      zone: "UTC+08:00",
      text: "Philippine Standard Time",
    },
    {
      id: "285",
      zone: "UTC+08:00",
      text: "Singapore Standard Time",
    },
    {
      id: "286",
      zone: "UTC+08:00",
      text: "Taipei Standard Time",
    },
    {
      id: "287",
      zone: "UTC+08:00",
      text: "Ulaanbaatar Standard Time - Choibalsan",
    },
    {
      id: "288",
      zone: "UTC+08:00",
      text: "Ulaanbaatar Standard Time - Ulaambaatar",
    },
    {
      id: "289",
      zone: "UTC+08:45",
      text: "Australian Central Western Standard Time",
    },
    {
      id: "290",
      zone: "UTC+09:00",
      text: "East Timor Time",
    },
    {
      id: "291",
      zone: "UTC+09:00",
      text: "Eastern Indonesia Time",
    },
    {
      id: "292",
      zone: "UTC+09:00",
      text: "Japan Standard Time",
    },
    {
      id: "293",
      zone: "UTC+09:00",
      text: "Korean Standard Time - Pyongyang",
    },
    {
      id: "294",
      zone: "UTC+09:00",
      text: "Korean Standard Time - Seoul",
    },
    {
      id: "295",
      zone: "UTC+09:00",
      text: "Palau Time",
    },
    {
      id: "296",
      zone: "UTC+09:00",
      text: "Yakutsk Standard Time - Chita",
    },
    {
      id: "297",
      zone: "UTC+09:00",
      text: "Yakutsk Standard Time - Khandyga",
    },
    {
      id: "298",
      zone: "UTC+09:00",
      text: "Yakutsk Standard Time - Yakutsk",
    },
    { id: "299", zone: "UTC+09:30", text: "Australian Central Standard Time" },
    {
      id: "300",
      zone: "UTC+10:00",
      text: "Australian Eastern Standard Time - Brisbane",
    },
    {
      id: "301",
      zone: "UTC+10:00",
      text: "Australian Eastern Standard Time - Lindeman",
    },
    {
      id: "302",
      zone: "UTC+10:00",
      text: "Chamorro Standard Time",
    },
    {
      id: "303",
      zone: "UTC+10:00",
      text: "Chuuk Time",
    },
    {
      id: "304",
      zone: "UTC+10:00",
      text: "Papua New Guinea Time",
    },
    {
      id: "305",
      zone: "UTC+10:00",
      text: "Vladivostok Standard Time - Ust-Ner",
    },
    {
      id: "306",
      zone: "UTC+10:00",
      text: "Vladivostok Standard Time - Vladivostok",
    },
    {
      id: "307",
      zone: "UTC+10:30",
      text: "Central Australia Time - Adelaide",
    },
    {
      id: "308",
      zone: "UTC+10:30",
      text: "Central Australia Time - Broken Hill",
    },
    {
      id: "309",
      zone: "UTC+11:00",
      text: "Bougainville Time",
    },
    {
      id: "310",
      zone: "UTC+11:00",
      text: "Casey Time",
    },
    {
      id: "311",
      zone: "UTC+11:00",
      text: "Eastern Australia Time - Hobart",
    },
    {
      id: "312",
      zone: "UTC+11:00",
      text: "Eastern Australia Time - Macquarie",
    },
    {
      id: "313",
      zone: "UTC+11:00",
      text: "Eastern Australia Time - Melbourne",
    },
    {
      id: "314",
      zone: "UTC+11:00",
      text: "Eastern Australia Time - Sydney",
    },
    {
      id: "315",
      zone: "UTC+11:00",
      text: "Kosrae Time",
    },
    {
      id: "316",
      zone: "UTC+11:00",
      text: "Lord Howe Time",
    },
    {
      id: "317",
      zone: "UTC+11:00",
      text: "Magadan Standard Time",
    },
    {
      id: "318",
      zone: "UTC+11:00",
      text: "New Caledonia Standard Time",
    },
    {
      id: "319",
      zone: "UTC+11:00",
      text: "Ponape Time",
    },
    {
      id: "320",
      zone: "UTC+11:00",
      text: "Sakhalin Standard Time",
    },
    {
      id: "321",
      zone: "UTC+11:00",
      text: "Solomon Islands Time",
    },
    {
      id: "322",
      zone: "UTC+11:00",
      text: "Srednekolymsk Time",
    },
    {
      id: "323",
      zone: "UTC+11:00",
      text: "Vanuatu Standard Time",
    },
    {
      id: "324",
      zone: "UTC+12:00",
      text: "Anadyr Standard Time",
    },
    {
      id: "325",
      zone: "UTC+12:00",
      text: "Fiji Standard Time",
    },
    {
      id: "326",
      zone: "UTC+12:00",
      text: "Gilbert Island Time",
    },
    {
      id: "327",
      zone: "UTC+12:00",
      text: "Marshall Island Time - Kwajalein",
    },
    {
      id: "328",
      zone: "UTC+12:00",
      text: "Marshall Island Time - Majuro",
    },
    {
      id: "329",
      zone: "UTC+12:00",
      text: "Nauru Time",
    },
    {
      id: "330",
      zone: "UTC+12:00",
      text: "Norfolk Island Time",
    },
    {
      id: "331",
      zone: "UTC+12:00",
      text: "Petropavlovsk-Kamchatski Standard Time",
    },
    {
      id: "332",
      zone: "UTC+12:00",
      text: "Tuvalu Time",
    },
    {
      id: "333",
      zone: "UTC+12:00",
      text: "Wake Island Time",
    },
    {
      id: "334",
      zone: "UTC+12:00",
      text: "Wallis & Futuna Time",
    },
    {
      id: "335",
      zone: "UTC+13:00",
      text: "Apia Standard Time",
    },
    { id: "336", zone: "UTC+13:00", text: "New Zealand Time" },
    { id: "337", zone: "UTC+13:00", text: "Phoenix Islands Time" },
    { id: "338", zone: "UTC+13:00", text: "Tokelau Time" },
    { id: "339", zone: "UTC+13:00", text: "Tonga Standard Time" },
    { id: "340", zone: "UTC+13:45", text: "Chatham Time" },
    { id: "341", zone: "UTC+14:00", text: "Line Islands Time" },
  ];
  for (let seed of seeds) {
    let checkSeed = await knex(table).select().where(seed).first();
    if (!checkSeed) {
      await knex.raw(
        `
          INSERT INTO time_zones (id, zone, text) VALUES (
            :id,
            :zone,
            :text
            )`,
        {
          id: seed.id,
          zone: seed.zone,
          text: seed.text,
        }
      );
    }
  }
};
