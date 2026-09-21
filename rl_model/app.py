from flask import Flask, request, jsonify
from q_learning import TrafficRL

app = Flask(__name__)
model = TrafficRL()

@app.route("/get_signal", methods=["POST"])
def get_signal():
    data = request.json
    traffic = data.get("traffic", [0, 0, 0, 0])

    state = model.get_state(traffic)
    action = model.choose_action(state)

    signal = "NS_GREEN" if action == 0 else "EW_GREEN"
    reward = model.get_reward(traffic)

    next_state = model.get_state([max(0, t-2) for t in traffic])
    model.update(state, action, reward, next_state)

    return jsonify({
        "signal": signal,
        "state": state,
        "reward": reward
    })

if __name__ == "__main__":
    app.run(port=8000, debug=True)