var shouldHideFinishedCalls = false // store these settings is cookies?
var shouldNotFlashCalls = false
var deletedFirstRow = false
var todaysRowsTotal = 0

$('#hideFinishedCheck').on('change', evt => {
    if ($(evt.target).is(':checked')) {
        shouldHideFinishedCalls = true
    } else {
        shouldHideFinishedCalls = false
    }
})

$('#flashingCheck').on('change', evt => {
    if ($(evt.target).is(':checked')) {
        shouldNotFlashCalls = true
    } else {
        shouldNotFlashCalls = false
    }
})

function setCancelButtonEventListeners() {
    $(".cancelButton").each(function (idx, el) {
        const callID = el.id.split("-")[1]
        todaysRowsTotal += 1
        $("#cancelButton-"+callID).on('click', () => {
            fetch('delete-call', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'CSRF-Token': Cookies.get('XSRF-TOKEN'),
                },
                body: JSON.stringify({ doctorID: DOCTOR_ID, roomID: callID }),
            })
            .then((res) => {
                if (res.ok) {
                    el.parentElement.parentElement.style.display = "none" // hide the row
                    if (idx == todaysRowsTotal - 1) {
                        deletedFirstRow = true
                    }
                    todaysRowsTotal -= 1
                }
            })
            .catch((error) => {
                // console.log(error)
            })
        })
    })
}

function updateTimeLeft() {
    $("#todaysCallsTableBody").find('tr').each(function (i, el) {
        const timeCell = $(this).find('td').eq(2)[0]
        const callTime = Date.parse(timeCell.getAttribute('data-callTime'))
        const isFinished = timeCell.getAttribute('data-finished') == 'true'                                        
    
        const timeLeft = callTime - Date.parse(new Date());
        if (timeLeft < 0) {
            if (!isFinished) {  // passed time but not finished

                // Over time threshold message: show between 2 and 10 mins overtime
                var secondsAgo = -timeLeft / 1000
                var minsAgo = Math.floor(secondsAgo / 60);
                var isLate = false

                const MIN_THRESHOLD = 2 * 60
                const MAX_THRESHOLD = 10 * 60
                if (secondsAgo >= MIN_THRESHOLD && secondsAgo <= MAX_THRESHOLD) {
                    timeCell.innerHTML = "<b>Scheduled for " + minsAgo.toString() + "m " + (secondsAgo - minsAgo * 60).toString() + "s ago" + "</b>"
                } else if (secondsAgo > MAX_THRESHOLD) { // over 10 mins
                    isLate = true
                    timeCell.innerHTML = "<b>You are late to this call (by " + minsAgo + " mins)" + "</b>"
                } else { // if under 2 mins, still 'starting now'
                    timeCell.innerHTML = "<b>Starting now</b>"
                }

                if (!shouldNotFlashCalls) {
                    if (isLate) {
                        $(this).addClass('late')
                    } else {
                        $(this).addClass('startingSoon')
                    }
                } else {
                    $(this).removeClass('startingSoon')
                    $(this).removeClass('late')
                }
                return

            } else {    // passed time and already finished
                $(this).removeClass('startingSoon')
                $(this).removeClass('late')
                if (shouldHideFinishedCalls) {
                    $(this).hide()
                } else {
                    $(this).show()
                    $(this).addClass('finished') // grey out the row
                    $(this).find('td').eq(3).first('a').html("") // remove link
                    $(this).find('td').eq(4).html("") // remove button
                    timeCell.innerHTML = "This call has already finished"
                }
                return
            }
        }

        // time remaining unit calculations
        const seconds = Math.floor( (timeLeft/1000) % 60 );
        const minutes = Math.floor( (timeLeft/1000/60) % 60 );
        const hours = Math.floor( (timeLeft/(1000*60*60)) % 24 );
        const timeText = (hours != 0 ? hours + ' hrs' : '') + ' ' + (minutes != 0 ? minutes + ' mins' : '')
        
        // if less than 1 min remaining
        if (timeText == ' ') {
            if (!shouldNotFlashCalls) {
                $(this).addClass('startingSoon')
            } else {
                $(this).removeClass('startingSoon')
            }
            timeCell.innerHTML = "<b>Starting now</b>"
            return
        }                                       
        timeCell.innerHTML = timeText + " left"
    })
}

window.addEventListener("DOMContentLoaded", () => {
    setCancelButtonEventListeners()
    updateTimeLeft()
})

setInterval(updateTimeLeft, 1000 * 1)
setInterval(() => {
    if (todaysRowsTotal <= 1 && deletedFirstRow) {
        $("#todaysCallsTableDiv").html(`<h5 class="text-center" style="margin-bottom: 20px;">You haven't got any scheduled calls today.</h5>`)
    }
}, 100)