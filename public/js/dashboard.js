var loadedCallHistoryYet = false

$(document).ready(function() {
    $("#callHistoryTable").hide()
})

$("#startCheckbox").click(function() {
    if ($(this).prop("checked")) {
        $("#scheduleTimeInput").hide()
        $("#startCallButton").html('Start Call')
    } else {
        $("#scheduleTimeInput").show()
        $("#startCallButton").html('Schedule Call')
    }
})

function processCallHistoryData(callHistory) {
    var data = []
    for (let call of callHistory) {
        const callDate = new Date(call.startsAt)
        data.push({
            'callID': call.roomCode,
            'date': callDate.toLocaleString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
            'time': callDate.toLocaleTimeString()
        })
    }
    return data
}

$("#viewCallHistoryButton").on('click', function() {
    $("#callHistoryModal").modal('toggle')
    if (loadedCallHistoryYet == false) {

        $("#callHistoryModalContent").LoadingOverlay('show', {
            imageColor: "rgb(5,90,218)",
        });

        fetch('call-history', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'CSRF-Token': Cookies.get('XSRF-TOKEN'),
            },
            body: JSON.stringify({ doctorID: DOCTOR_ID }),
        })
        .then((res) => {
            // convert response body to json
            res.json()
            .then((jsonData) => {
                console.log(jsonData)
                console.log(processCallHistoryData(jsonData))
                $("#callHistoryTable").bootstrapTable({data: processCallHistoryData(jsonData)})
                $("#callHistoryModalContent").LoadingOverlay('hide')
                $("#callHistoryTable").show()
                loadedCallHistoryYet = true
            })
            .catch((error) => {
                console.log(error)
                $("#callHistoryModalBody").html("Could not load data (JSON parsing error)")
                $("#callHistoryModalContent").LoadingOverlay('hide')
            })
        })
        .catch((error) => {
            $("#callHistoryModalBody").html("Could not load data (server error)")
            $("#callHistoryModalContent").LoadingOverlay('hide')
        })
    }
})