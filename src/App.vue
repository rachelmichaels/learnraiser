<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getDonations } from './services/donations'

const campaignName = 'Learnraiser'
const campaignGoal = 10000
const campaignEndDate = '2026-06-30'
const denverKollelLogoUrl = 'https://denverkollel.org/wp-content/uploads/2021/06/header_logo.png'
const googleFormUrl = import.meta.env.VITE_GOOGLE_FORM_URL || ''
const refreshSeconds = 30

const donations = ref([])
const selectedTeam = ref('All teams')
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const dataSource = ref('unconfigured')
const lastUpdated = ref('')
const celebrationActive = ref(false)
const celebrationKey = ref(0)
const celebrationKind = ref('lead')
const celebrationTitle = ref('')
const celebrationTeam = ref('')
const celebrationDetail = ref('')
const overtakingTeam = ref('')
let refreshTimerId
let celebrationTimerId

onMounted(async () => {
  await loadDonations({ initial: true })
  refreshTimerId = window.setInterval(() => loadDonations(), refreshSeconds * 1000)
})

onBeforeUnmount(() => {
  window.clearInterval(refreshTimerId)
  window.clearTimeout(celebrationTimerId)
})

async function loadDonations({ initial = false } = {}) {
  if (refreshing.value) {
    return
  }

  refreshing.value = true
  error.value = ''

  try {
    const result = await getDonations()
    donations.value = result.donations
    dataSource.value = result.source
    lastUpdated.value = new Date().toISOString()
  } catch (caughtError) {
    error.value = 'Could not load live donations. Check the response feed URL.'
    donations.value = []
    dataSource.value = 'error'
    console.error(caughtError)
  } finally {
    if (initial) {
      loading.value = false
    }

    refreshing.value = false
  }
}

const totalMinutes = computed(() => donations.value.reduce((sum, donation) => sum + donation.minutes, 0))
const percentComplete = computed(() => Math.min(100, Math.round((totalMinutes.value / campaignGoal) * 100)))
const remainingMinutes = computed(() => Math.max(0, campaignGoal - totalMinutes.value))
const donorCount = computed(() => donations.value.length)

const teamTotals = computed(() => {
  const totals = donations.value.reduce((teams, donation) => {
    const existing = teams.get(donation.team) || { name: donation.team, minutes: 0, donors: 0 }
    existing.minutes += donation.minutes
    existing.donors += 1
    teams.set(donation.team, existing)
    return teams
  }, new Map())

  return [...totals.values()].sort((a, b) => b.minutes - a.minutes)
})

const maxTeamMinutes = computed(() => Math.max(1, ...teamTotals.value.map((team) => team.minutes)))
const teamOptions = computed(() => ['All teams', ...teamTotals.value.map((team) => team.name)])

const filteredDonations = computed(() => {
  const sorted = [...donations.value].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  if (selectedTeam.value === 'All teams') {
    return sorted
  }

  return sorted.filter((donation) => donation.team === selectedTeam.value)
})

const topTeam = computed(() => teamTotals.value[0])
const teamAccentColors = ['#1f7a5c', '#2f6f9f', '#c7922b', '#d76745', '#7a5aa6']
const confettiColors = ['#0f766e', '#2563eb', '#0891b2', '#16a34a', '#f59e0b', '#dc2626']
const confettiPieces = Array.from({ length: 72 }, (_, index) => ({
  id: index,
  style: {
    '--confetti-x': `${(index * 37) % 100}%`,
    '--confetti-delay': `${(index % 18) * 72}ms`,
    '--confetti-duration': `${2600 + (index % 7) * 180}ms`,
    '--confetti-drift': `${((index % 9) - 4) * 18}px`,
    '--confetti-rotate': `${(index * 53) % 360}deg`,
    '--confetti-color': confettiColors[index % confettiColors.length],
  },
}))

watch(
  () => teamTotals.value.map((team) => ({ name: team.name, minutes: team.minutes })),
  (newStandings, previousStandings) => {
    if (previousStandings.length === 0 || newStandings.length === 0) {
      return
    }

    const overtake = findOvertake(newStandings, previousStandings)

    if (overtake) {
      triggerOvertakeCelebration(overtake)
    }
  },
)

function displayName(donation) {
  return donation.showName ? donation.name : 'Anonymous'
}

function formatMinutes(minutes) {
  return new Intl.NumberFormat('en-US').format(minutes)
}

function teamRaceStyle(team, index) {
  const height = Math.max(8, Math.round((team.minutes / maxTeamMinutes.value) * 100))

  return {
    '--team-height': `${height}%`,
    '--team-accent': teamAccentColors[index % teamAccentColors.length],
  }
}

function findOvertake(newStandings, previousStandings) {
  const newPositions = new Map(newStandings.map((team, index) => [team.name, { ...team, index }]))
  const previousPositions = new Map(previousStandings.map((team, index) => [team.name, { ...team, index }]))

  return newStandings
    .map((team, newIndex) => {
      const previousTeam = previousPositions.get(team.name)
      const previousIndex = previousTeam?.index ?? previousStandings.length

      if (newIndex >= previousIndex) {
        return null
      }

      const passedTeams = previousStandings.filter((otherTeam, previousOtherIndex) => {
        const newOtherTeam = newPositions.get(otherTeam.name)
        return (
          previousOtherIndex < previousIndex &&
          newOtherTeam &&
          newOtherTeam.index > newIndex &&
          team.minutes > newOtherTeam.minutes
        )
      })

      if (passedTeams.length === 0) {
        return null
      }

      return {
        teamName: team.name,
        passedTeams: passedTeams.map((teamPassed) => teamPassed.name),
        newIndex,
        rankJump: previousIndex - newIndex,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.passedTeams.length - a.passedTeams.length || b.rankJump - a.rankJump || a.newIndex - b.newIndex)[0]
}

function formatPassedTeams(teamNames) {
  if (teamNames.length === 1) {
    return teamNames[0]
  }

  if (teamNames.length === 2) {
    return `${teamNames[0]} and ${teamNames[1]}`
  }

  return `${teamNames[0]} and ${teamNames.length - 1} others`
}

function triggerOvertakeCelebration(overtake) {
  const tookLead = overtake.newIndex === 0

  celebrationKind.value = tookLead ? 'lead' : 'move'
  celebrationTitle.value = tookLead ? 'Took the lead' : 'Moved ahead'
  celebrationTeam.value = overtake.teamName
  celebrationDetail.value = `Passed ${formatPassedTeams(overtake.passedTeams)}`
  overtakingTeam.value = overtake.teamName
  celebrationKey.value += 1
  celebrationActive.value = true

  window.clearTimeout(celebrationTimerId)
  celebrationTimerId = window.setTimeout(() => {
    celebrationActive.value = false
    overtakingTeam.value = ''
  }, 5200)
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'Recently'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return 'Recently'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatEndDate(dateValue) {
  if (!dateValue) {
    return 'Open campaign'
  }

  const date = new Date(`${dateValue}T12:00:00`)

  if (Number.isNaN(date.getTime())) {
    return 'Open campaign'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatLastUpdated(timestamp) {
  if (!timestamp) {
    return 'Not checked yet'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}
</script>

<template>
  <main class="app-shell">
    <div
      v-if="celebrationActive"
      :key="celebrationKey"
      class="lead-celebration"
      :class="{ 'is-move': celebrationKind === 'move' }"
      role="status"
      aria-live="polite"
    >
      <div class="lead-celebration-card">
        <span>{{ celebrationTitle }}</span>
        <strong>{{ celebrationTeam }}</strong>
        <small>{{ celebrationDetail }}</small>
      </div>
      <span
        v-if="celebrationKind === 'lead'"
        v-for="piece in confettiPieces"
        :key="piece.id"
        class="confetti-piece"
        :style="piece.style"
        aria-hidden="true"
      ></span>
    </div>

    <section class="campaign-panel">
      <div class="campaign-copy">
        <p class="eyebrow">Minutes campaign</p>
        <h1>{{ campaignName }}</h1>
        <p class="campaign-summary">
          Track time given by donors and teams toward one shared goal.
        </p>

        <div class="campaign-actions">
          <a v-if="googleFormUrl" class="primary-action" :href="googleFormUrl" target="_blank" rel="noreferrer">
            Log minutes
          </a>
          <button v-else class="primary-action disabled-action" type="button" disabled>
            Add form link
          </button>
          <span class="deadline">{{ formatEndDate(campaignEndDate) }}</span>
        </div>
      </div>

      <div class="campaign-side">
        <div class="brand-lockup" aria-label="Denver Kollel">
          <img class="campaign-logo" :src="denverKollelLogoUrl" alt="Denver Kollel" />
        </div>

        <div class="progress-card" aria-label="Campaign progress">
          <div class="progress-ring" :style="{ '--progress': `${percentComplete * 3.6}deg` }">
            <div>
              <strong>{{ percentComplete }}%</strong>
              <span>complete</span>
            </div>
          </div>

          <div class="progress-details">
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${percentComplete}%` }"></div>
            </div>
            <span>{{ formatMinutes(remainingMinutes) }} minutes to go</span>
          </div>
        </div>
      </div>
    </section>

    <section class="stats-grid" aria-label="Campaign stats">
      <div class="stat-box">
        <span>Total minutes</span>
        <strong>{{ formatMinutes(totalMinutes) }}</strong>
      </div>
      <div class="stat-box">
        <span>Goal</span>
        <strong>{{ formatMinutes(campaignGoal) }}</strong>
      </div>
      <div class="stat-box">
        <span>Donors</span>
        <strong>{{ donorCount }}</strong>
      </div>
      <div class="stat-box">
        <span>Top team</span>
        <strong>{{ topTeam?.name || 'None yet' }}</strong>
      </div>
    </section>

    <p v-if="error" class="notice">{{ error }}</p>
    <p v-else-if="dataSource === 'unconfigured'" class="notice">
      No response feed is connected yet. Add your Apps Script <code>/exec</code> URL to show Google Form responses.
    </p>

    <section class="dashboard-grid">
      <article class="panel team-chart-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Leaderboard</p>
            <h2>Teams</h2>
          </div>
        </div>

        <div v-if="loading" class="empty-state">Loading teams...</div>
        <div v-else class="team-list team-bar-chart">
          <div
            v-for="(team, index) in teamTotals"
            :key="team.name"
            class="team-row team-bar-card"
            :class="{ 'is-overtaking': overtakingTeam === team.name }"
            :style="teamRaceStyle(team, index)"
          >
            <div class="bar-plot" aria-hidden="true">
              <div class="bar-fill">
                <strong class="bar-value">{{ formatMinutes(team.minutes) }}</strong>
              </div>
            </div>

            <div class="team-info bar-label">
              <strong>{{ team.name }}</strong>
              <span>{{ team.donors }} donors</span>
            </div>
          </div>
        </div>
      </article>

      <article class="panel donor-panel">
        <div class="panel-heading donor-heading">
          <div>
            <p class="eyebrow">Recent gifts</p>
            <h2>Donations</h2>
          </div>

          <label class="team-filter">
            <span>Team</span>
            <select v-model="selectedTeam">
              <option v-for="team in teamOptions" :key="team" :value="team">
                {{ team }}
              </option>
            </select>
          </label>
        </div>

        <div class="refresh-bar">
          <!-- Updates every {{ refreshSeconds }} seconds.  -->
          <span>
            Last updated {{ formatLastUpdated(lastUpdated) }}.
          </span>
          <!-- <button type="button" class="refresh-button" :disabled="refreshing" @click="loadDonations()">
            {{ refreshing ? 'Refreshing...' : 'Refresh now' }}
          </button> -->
        </div>

        <div v-if="loading" class="empty-state">Loading donors...</div>
        <div v-else-if="filteredDonations.length === 0" class="empty-state">No minutes logged yet.</div>
        <div v-else class="donor-scroll" :class="{ 'is-static': filteredDonations.length <= 4 }" aria-label="Recent donations">
          <div class="donor-scroll-track" :class="{ 'is-static': filteredDonations.length <= 4 }">
            <div v-for="copy in 2" :key="copy" class="donor-list" :aria-hidden="copy === 2">
              <div
                v-for="donation in filteredDonations"
                :key="`${copy}-${donation.timestamp}-${donation.name}-${donation.minutes}`"
                class="donor-row"
              >
                <div class="avatar" aria-hidden="true">{{ displayName(donation).charAt(0).toUpperCase() }}</div>
                <div class="donor-copy">
                  <div class="donor-line">
                    <strong>{{ displayName(donation) }}</strong>
                    <span>{{ formatMinutes(donation.minutes) }} min</span>
                  </div>
                  <div class="donor-meta">
                    <span>{{ donation.team }}</span>
                    <span>{{ formatTimestamp(donation.timestamp) }}</span>
                  </div>
                  <p v-if="donation.message">{{ donation.message }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
