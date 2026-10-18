import { Link } from 'react-router-dom';
import { BackLink, Glass } from '../../components/Layout';

export function LactationSupport() {
  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><span className="eyebrow">FEEDING SUPPORT</span><h1 className="title">Lactation support</h1><p className="lede">Every feeding journey is different. Track what matters to you and bring questions to a qualified lactation professional.</p></div>
      <Glass>
        <div className="stack stack--lg">
          <h2 className="subtitle">Useful next steps</h2>
          <div className="list">
            <div className="item"><div className="item__body"><div className="item__title">Log a feed</div><div className="faint">Note breast, bottle, expressed milk or formula without judging the choice.</div></div><Link className="link-btn" to="/baby?log=feeding">Open feed log</Link></div>
            <div className="item"><div className="item__body"><div className="item__title">Latch, pain or supply concerns</div><div className="faint">A lactation consultant or your clinician can assess your situation and offer personal support.</div></div></div>
            <div className="item"><div className="item__body"><div className="item__title">Questions about medicines</div><div className="faint">Ask your clinician or pharmacist before changing a prescribed medicine while feeding.</div></div></div>
          </div>
          <p className="callout">This page is general information, not a feeding assessment or treatment plan. For urgent symptoms, open <Link to="/help">Get help</Link>.</p>
        </div>
      </Glass>
      <Glass variant="glass--tint"><div className="stack"><h2 className="subtitle">Trusted resources</h2><a href="https://www.nhs.uk/start-for-life/baby/feeding-your-baby/breastfeeding/" target="_blank" rel="noreferrer">NHS breastfeeding guides and support</a><a href="https://www.cdc.gov/breastfeeding-special-circumstances/hcp/diet-micronutrients/maternal-diet.html" target="_blank" rel="noreferrer">CDC breastfeeding information</a></div></Glass>
    </>
  );
}

export function PostpartumNutrition() {
  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><span className="eyebrow">GENTLE, GENERAL GUIDANCE</span><h1 className="title">Postpartum nutrition</h1><p className="lede">Recovery and feeding needs vary. There is no single meal plan that fits everyone.</p></div>
      <Glass>
        <div className="stack stack--lg">
          <h2 className="subtitle">Everyday foundations</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            <li>When possible, choose regular meals with a variety of grains, protein foods, fruits and vegetables.</li>
            <li>Keep a drink nearby and follow your thirst; individual fluid needs vary.</li>
            <li>If breastfeeding, vegan, recovering from a condition, or taking medicines, ask your clinician whether you need individualized nutrition or supplement advice.</li>
          </ul>
          <p className="callout">Embrace does not calculate calorie needs, prescribe supplements, or diagnose deficiencies. Ask your clinician for advice tailored to your health and local diet.</p>
        </div>
      </Glass>
      <Glass variant="glass--tint"><div className="stack"><h2 className="subtitle">Trusted resources</h2><a href="https://www.cdc.gov/breastfeeding-special-circumstances/hcp/diet-micronutrients/maternal-diet.html" target="_blank" rel="noreferrer">CDC: diet and breastfeeding</a><a href="https://www.nhs.uk/start-for-life/baby/feeding-your-baby/breastfeeding/healthy-diet-when-breastfeeding/food-and-drinks-to-avoid-when-breastfeeding/" target="_blank" rel="noreferrer">NHS: healthy diet when breastfeeding</a></div></Glass>
    </>
  );
}