// Score as a percentage rounded to one decimal (2 of 3 -> "66.7%"), or "--" while there's no score
const percent = (awarded, possible) =>
    awarded == null || !possible ? '--' : `${(Math.round((awarded / possible) * 1000) / 10).toFixed(1)}%`

export default percent
